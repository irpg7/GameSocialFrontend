import { Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { SharedPostPreviewModel, SquadMessageModel } from '../../../../models/squad.model';
import { clock, clockTime } from '../squad-format';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { PHONE_QUERY, mediaQuery } from '../../../../shared/media-query';

/** How long a finger has to stay on a message before the actions sheet opens. */
const LONG_PRESS_MS = 450;
/** A finger that travels further than this is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10;

interface MessageDayGroup {
  /** `Today` / `Yesterday` / a short date — the design's chat divider. */
  label: string;
  messages: SquadMessageModel[];
}

export interface ReactRequest {
  message: SquadMessageModel;
  emoji: string;
}

/**
 * Chat tab of the squad room, `onSquad` + `onChat` (05-squad.html L208–254):
 * `#channel ——— Today` divider, message rows with the author's LV chip and
 * reaction chips (▲ 4 / 🔥 2), shared posts as the large SQUAD CLIP card
 * (▲ votes · 💬 comments · "Push to main feed →"), achievement system rows
 * ("X unlocked Y — squad earned +300 XP"), a typing line, and the composer.
 *
 * Phones (squad-chat.mobile.scss): no hover strip — a long press (or the context
 * menu) emits `messageActions` for the room's actions sheet, and the composer's
 * ▶ ▣ fold into one ＋ menu.
 */
@Component({
  selector: 'app-squad-chat',
  imports: [ImgFallback, FormField],
  templateUrl: './squad-chat.html',
  styleUrls: ['./squad-chat.scss', './squad-chat.mobile.scss'],
  host: {
    '(document:keydown.escape)': 'isAttachOpen.set(false)',
  },
})
export class SquadChat {
  channelName = input<string | undefined>(undefined);
  messages = input.required<SquadMessageModel[]>();
  /** userId → level (roster). */
  levels = input<Record<string, number>>({});
  isMember = input(false);
  isLoading = input(false);
  hasMore = input(false);
  isSending = input(false);
  currentAvatarUrl = input<string | undefined>(undefined);
  /** Usernames currently typing in this channel (realtime). */
  typingUsers = input<string[]>([]);

  send = output<string>();
  loadEarlier = output<void>();
  react = output<ReactRequest>();
  attachClip = output<void>();
  attachScreens = output<void>();
  openShared = output<SharedPostPreviewModel>();
  typing = output<void>();
  /** Phone: long press / context menu on a message — the room opens the actions sheet. */
  messageActions = output<SquadMessageModel>();

  protected readonly quickReactions = ['▲', '🔥', '😂', '👍'];
  protected readonly draft = signal('');
  /** Composer: single-field Signal Form; `draft` stays the model. */
  protected readonly draftField = form(this.draft, (path) => maxLength(path, 1000));
  protected readonly clock = clock;
  protected readonly isAttachOpen = signal(false);

  private readonly isPhone = mediaQuery(PHONE_QUERY);

  protected readonly placeholder = computed(() => {
    const channel = `#${this.channelName() ?? 'genel'} kanalına yaz`;
    return this.isPhone() ? channel : `${channel} — ya da klip bırak`;
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private lastNewestId: string | null = null;

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressOrigin: { x: number; y: number } | null = null;
  /** Set when the long press already opened the sheet, so the context menu that follows on Android doesn't open it twice. */
  private pressFired = false;

  constructor() {
    // Stick to the bottom when a newer message arrives (not when older pages are prepended).
    afterRenderEffect(() => {
      const list = this.messages();
      const newest = list[list.length - 1]?.id ?? null;
      const element = this.scroller()?.nativeElement;
      if (element && newest !== this.lastNewestId) {
        this.lastNewestId = newest;
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  protected readonly groups = computed<MessageDayGroup[]>(() => {
    const groups: MessageDayGroup[] = [];
    for (const message of this.messages()) {
      const label = this.dayLabel(message.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.messages.push(message);
      } else {
        groups.push({ label, messages: [message] });
      }
    }
    return groups;
  });

  protected readonly typingLine = computed(() => {
    const users = this.typingUsers();
    if (users.length === 0) {
      return null;
    }
    return users.length === 1 ? `${users[0]} yazıyor…` : `${users.slice(0, 2).join(', ')} yazıyor…`;
  });

  protected level(userId: string): number | null {
    return this.levels()[userId] ?? null;
  }

  protected time(iso: string): string {
    return clockTime(iso);
  }

  protected sharedNoun(postType: string): string {
    return postType === 'Clip' ? 'clip' : postType === 'Screenshots' ? 'screenshot' : 'post';
  }

  /** User keystrokes only (the field binding already wrote the model) — clearing after send doesn't count as typing. */
  protected onDraftInput(event: Event): void {
    if ((event.target as HTMLInputElement).value.trim()) {
      this.typing.emit();
    }
  }

  protected submit(): void {
    const body = this.draft().trim();
    if (!body || this.isSending()) {
      return;
    }
    this.send.emit(body);
    this.draft.set('');
  }

  protected pickAttach(kind: 'clip' | 'screens'): void {
    this.isAttachOpen.set(false);
    if (kind === 'clip') {
      this.attachClip.emit();
    } else {
      this.attachScreens.emit();
    }
  }

  // ─── Phone long press → actions sheet ─────────────────────────────────────

  protected pressStart(event: PointerEvent, message: SquadMessageModel): void {
    if (event.pointerType !== 'touch' || !this.isPhone()) {
      return;
    }
    // A tap on a button inside the message (reaction, shared card) is that button's job.
    if ((event.target as HTMLElement | null)?.closest('button, a')) {
      return;
    }
    this.pressEnd();
    this.pressFired = false;
    this.pressOrigin = { x: event.clientX, y: event.clientY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.pressFired = true;
      this.messageActions.emit(message);
    }, LONG_PRESS_MS);
  }

  protected pressMove(event: PointerEvent): void {
    const origin = this.pressOrigin;
    if (this.pressTimer && origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_SLOP_PX) {
      this.pressEnd();
    }
  }

  protected pressEnd(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.pressOrigin = null;
  }

  /** Android fires a context menu on long press; desktop right-click keeps the browser menu. */
  protected onContextMenu(event: MouseEvent, message: SquadMessageModel): void {
    if (!this.isPhone()) {
      return;
    }
    event.preventDefault();
    if (this.pressFired) {
      this.pressFired = false;
      return;
    }
    this.pressEnd();
    this.messageActions.emit(message);
  }

  private dayLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
    if (dayDiff === 0) {
      return 'Today';
    }
    if (dayDiff === 1) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('tr-TR');
  }
}
