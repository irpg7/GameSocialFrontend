import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { DirectMessageService } from '../../services/direct-message/direct-message.service';
import { UserRealtimeService } from '../../services/realtime/user-realtime.service';
import { AuthService } from '../../services/auth/auth.service';
import { Conversation, DirectMessage } from '../../models/direct-message.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const PAGE_SIZE = 30;

/**
 * The /messages conversation list (provided by the page). Keeps rows current from the user hub: a new message
 * moves its conversation to the top and bumps the unread count unless that thread is open; an unknown
 * conversation (someone wrote first) triggers a reload.
 */
@Injectable()
export class InboxStore {
  private dms = inject(DirectMessageService);
  private realtime = inject(UserRealtimeService);
  private auth = inject(AuthService);

  readonly conversations = signal<Conversation[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly hasMore = signal(false);
  /** The thread on screen — its messages count as read. */
  readonly openId = signal<string | null>(null);

  private page = 1;
  private request: Subscription | null = null;

  constructor() {
    this.realtime.dmCreated$.pipe(takeUntilDestroyed()).subscribe((m) => this.onMessage(m));
    this.realtime.dmRead$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.readerId === this.auth.currentUser()?.id) {
        this.patch(e.conversationId, { unreadCount: 0 });
      } else {
        this.patch(e.conversationId, { otherLastReadAt: e.readAt });
      }
    });
    this.realtime.dmRemoved$.pipe(takeUntilDestroyed()).subscribe((e) => {
      const row = this.conversations().find((c) => c.id === e.conversationId);
      if (row?.lastMessage?.id === e.messageId) {
        this.refreshRow(e.conversationId);
      }
    });
    this.realtime.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.load(true));
  }

  load(reset: boolean): void {
    this.request?.unsubscribe();
    if (reset) {
      this.page = 1;
    }
    this.isLoading.set(true);
    this.loadError.set(null);
    this.request = this.dms.conversations(this.page, PAGE_SIZE).subscribe({
      next: (page) => {
        this.conversations.update((list) =>
          reset ? page.items : [...list, ...page.items.filter((c) => !list.some((x) => x.id === c.id))],
        );
        this.hasMore.set(page.hasMore);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.loadError.set(extractApiErrorMessage(err, 'Could not load your conversations.'));
      },
    });
  }

  loadMore(): void {
    this.page += 1;
    this.load(false);
  }

  /** Puts (or replaces) a row, e.g. a conversation just opened from a profile. */
  upsert(conversation: Conversation): void {
    this.conversations.update((list) => {
      const exists = list.some((c) => c.id === conversation.id);
      // Not loaded yet (a new, empty conversation, or one past the loaded pages): show it at the top now
      // instead of waiting for its first message to trigger a reload.
      return exists ? list.map((c) => (c.id === conversation.id ? conversation : c)) : [conversation, ...list];
    });
  }

  patch(conversationId: string, changes: Partial<Conversation>): void {
    this.conversations.update((list) => list.map((c) => (c.id === conversationId ? { ...c, ...changes } : c)));
  }

  remove(conversationId: string): void {
    this.conversations.update((list) => list.filter((c) => c.id !== conversationId));
  }

  private refreshRow(conversationId: string): void {
    this.dms.conversation(conversationId).subscribe({
      next: (c) => this.upsert(c),
      error: () => void 0,
    });
  }

  private onMessage(message: DirectMessage): void {
    const row = this.conversations().find((c) => c.id === message.conversationId);
    if (!row) {
      // A new conversation (or one past the loaded pages): the server knows its order and counts.
      this.load(true);
      return;
    }
    const mine = message.senderId === this.auth.currentUser()?.id;
    // The open thread reads its messages at once — unless the tab is in the background.
    const counts = !mine && (this.openId() !== message.conversationId || document.visibilityState === 'hidden');
    const updated: Conversation = {
      ...row,
      lastMessage: message,
      unreadCount: counts ? row.unreadCount + 1 : row.unreadCount,
    };
    this.conversations.update((list) => [updated, ...list.filter((c) => c.id !== row.id)]);
  }
}
