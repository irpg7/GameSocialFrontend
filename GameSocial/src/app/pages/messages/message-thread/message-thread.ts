import { Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { Subscription, forkJoin } from 'rxjs';
import { DirectMessageService } from '../../../services/direct-message/direct-message.service';
import { UserRealtimeService } from '../../../services/realtime/user-realtime.service';
import { AuthService } from '../../../services/auth/auth.service';
import { ReportService } from '../../../services/safety/report.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { Conversation, DIRECT_MESSAGE_MAX, DirectMessage } from '../../../models/direct-message.model';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { LoadError } from '../../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { InboxStore } from '../inbox.store';
import { ClearConversationSheet } from '../clear-conversation-sheet/clear-conversation-sheet';

const TYPING_VISIBLE_MS = 4000;

/**
 * One DM thread: header (who, presence, delete), history (older pages on demand), live messages, typing,
 * "Seen" receipt and the composer. Read-only conversations (block / the other side's privacy setting) keep
 * their history but replace the composer with a note.
 */
@Component({
  selector: 'app-message-thread',
  imports: [RouterLink, FormField, ImgFallback, LoadError, ClearConversationSheet],
  templateUrl: './message-thread.html',
  styleUrls: ['./message-thread.scss', './message-thread.mobile.scss'],
  host: {
    // Messages that arrived while the tab was in the background count as read once it's back.
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class MessageThread {
  private dms = inject(DirectMessageService);
  private realtime = inject(UserRealtimeService);
  private auth = inject(AuthService);
  private reports = inject(ReportService);
  private toast = inject(NotificationService);
  private store = inject(InboxStore);

  readonly conversationId = input.required<string>();
  /** Phones: back to the conversation list. */
  readonly back = output<void>();

  protected readonly maxLength = DIRECT_MESSAGE_MAX;
  protected readonly conversation = signal<Conversation | null>(null);
  protected readonly messages = signal<DirectMessage[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly isLoadingOlder = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly draftField = form(this.draft, (path) => maxLength(path, DIRECT_MESSAGE_MAX));
  protected readonly isSending = signal(false);
  protected readonly sendError = signal<string | null>(null);
  protected readonly isTyping = signal(false);
  protected readonly isClearOpen = signal(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private request: Subscription | null = null;
  private olderRequest: Subscription | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly myId = computed(() => this.auth.currentUser()?.id ?? null);

  /** "Seen" goes under my last message once the other side has read past it. */
  protected readonly seenMessageId = computed(() => {
    const readAt = this.conversation()?.otherLastReadAt;
    const mine = this.messages().filter((m) => m.senderId === this.myId());
    const last = mine.at(-1);
    return last && readAt && new Date(readAt).getTime() >= new Date(last.createdAt).getTime() ? last.id : null;
  });

  protected readonly readOnlyNote = computed(() => {
    const c = this.conversation();
    if (!c || c.canSend) return null;
    switch (c.readOnlyReason) {
      case 'Blocked':
        return "You can't message each other while one of you has blocked the other.";
      case 'Deleted':
        return 'This account was deleted. You can still read this conversation.';
      default:
        return `@${c.otherUsername} only accepts messages from certain people. You can still read this conversation.`;
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const id = this.conversationId();
      untracked(() => this.load(id));
    });

    this.realtime.dmCreated$.pipe(takeUntilDestroyed()).subscribe((m) => {
      if (m.conversationId !== this.conversationId()) return;
      this.append(m);
      if (m.senderId !== this.myId()) {
        this.isTyping.set(false);
        this.markRead();
      }
    });
    this.realtime.dmRemoved$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.conversationId === this.conversationId()) {
        this.messages.update((list) => list.filter((m) => m.id !== e.messageId));
      }
    });
    this.realtime.dmRead$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.conversationId === this.conversationId() && e.readerId !== this.myId()) {
        this.conversation.update((c) => (c ? { ...c, otherLastReadAt: e.readAt } : c));
      }
    });
    this.realtime.dmTyping$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.conversationId !== this.conversationId()) return;
      this.isTyping.set(true);
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.isTyping.set(false), TYPING_VISIBLE_MS);
    });
    this.realtime.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.load(this.conversationId()));

    destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      this.olderRequest?.unsubscribe();
      if (this.typingTimer) clearTimeout(this.typingTimer);
      if (this.store.openId() === this.conversationId()) this.store.openId.set(null);
    });
  }

  protected load(id: string): void {
    // This component is reused when another conversation opens: nothing of the previous one may leak in.
    const switched = untracked(() => this.store.openId()) !== id;
    this.request?.unsubscribe();
    this.olderRequest?.unsubscribe();
    this.isLoadingOlder.set(false);
    this.store.openId.set(id);
    this.conversation.set(null);
    this.messages.set([]);
    this.hasMore.set(false);
    this.isTyping.set(false);
    if (switched) {
      // A send still in flight finishes for its own conversation (see send()); the new one starts clean.
      this.draft.set('');
      this.isSending.set(false);
    }
    this.sendError.set(null);
    this.loadError.set(null);
    this.isLoading.set(true);
    this.request = forkJoin([this.dms.conversation(id), this.dms.messages(id)]).subscribe({
      next: ([conversation, page]) => {
        this.conversation.set(conversation);
        this.messages.set(page.items);
        this.hasMore.set(page.hasMore);
        this.isLoading.set(false);
        this.store.upsert(conversation);
        this.markRead();
        this.scrollToBottom();
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.loadError.set(extractApiErrorMessage(err, 'Could not load this conversation.'));
      },
    });
  }

  protected loadOlder(): void {
    const oldest = this.messages()[0];
    if (!oldest || this.isLoadingOlder()) return;
    const el = this.scroller()?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    this.isLoadingOlder.set(true);
    // Cancelled by load() if another conversation opens meanwhile, so its older page can't land there.
    this.olderRequest = this.dms.messages(this.conversationId(), oldest.id).subscribe({
      next: (page) => {
        this.messages.update((list) => [...page.items.filter((m) => !list.some((x) => x.id === m.id)), ...list]);
        this.hasMore.set(page.hasMore);
        this.isLoadingOlder.set(false);
        // Keep the message the reader was looking at in place.
        setTimeout(() => {
          if (el) el.scrollTop = el.scrollHeight - fromBottom;
        });
      },
      error: (err: unknown) => {
        this.isLoadingOlder.set(false);
        this.toast.error(extractApiErrorMessage(err, 'Could not load older messages.'));
      },
    });
  }

  protected onInput(): void {
    if (this.draft().trim()) this.realtime.typing(this.conversationId());
  }

  /** Enter sends, Shift+Enter is a new line. */
  protected onKeydown(event: KeyboardEvent): void {
    // keyCode 229: Safari fires the Enter that confirms an IME composition with isComposing already false.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    const body = this.draft().trim();
    if (!body || body.length > this.maxLength || this.isSending()) return;
    const id = this.conversationId();
    this.isSending.set(true);
    this.sendError.set(null);
    // Not cancelled on a conversation switch (the message may already be sent); the result only touches this
    // view while the same conversation is still open. The list preview follows the hub's dmCreated either way.
    const stillOpen = () => this.conversationId() === id;
    this.dms.send(id, body).subscribe({
      next: (message) => {
        if (!stillOpen()) return;
        this.isSending.set(false);
        this.draft.set('');
        this.append(message);
      },
      error: (err: unknown) => {
        if (!stillOpen()) return;
        this.isSending.set(false);
        this.sendError.set(extractApiErrorMessage(err, 'Message not sent. Try again.'));
        // 403: the conversation became read-only (blocked / privacy changed) — show why.
        this.dms.conversation(id).subscribe({ next: (c) => stillOpen() && this.conversation.set(c), error: () => void 0 });
      },
    });
  }

  protected report(message: DirectMessage): void {
    this.reports.open({ type: 'DirectMessage', id: message.id, label: `@${this.conversation()?.otherUsername ?? ''}'s message` });
  }

  protected onCleared(): void {
    this.isClearOpen.set(false);
    this.store.remove(this.conversationId());
    this.back.emit();
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** Day divider above the first message of each day. */
  protected dayLabel(index: number): string | null {
    const list = this.messages();
    const day = new Date(list[index].createdAt).toDateString();
    if (index > 0 && new Date(list[index - 1].createdAt).toDateString() === day) return null;
    return new Date(list[index].createdAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }

  private append(message: DirectMessage): void {
    if (this.messages().some((m) => m.id === message.id)) return;
    const el = this.scroller()?.nativeElement;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    this.messages.update((list) => [...list, message]);
    if (nearBottom || message.senderId === this.myId()) this.scrollToBottom();
  }

  protected onVisibilityChange(): void {
    const unread = this.store.conversations().find((c) => c.id === this.conversationId())?.unreadCount ?? 0;
    if (document.visibilityState === 'visible' && unread > 0) this.markRead();
  }

  private markRead(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.store.patch(this.conversationId(), { unreadCount: 0 });
    this.dms.markRead(this.conversationId()).subscribe({ error: () => void 0 });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
