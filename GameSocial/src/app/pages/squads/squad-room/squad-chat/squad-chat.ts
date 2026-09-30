import { Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedPostPreviewModel, SquadMessageModel } from '../../../../models/squad.model';
import { clock, clockTime } from '../squad-format';

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
 */
@Component({
  selector: 'app-squad-chat',
  imports: [FormsModule],
  templateUrl: './squad-chat.html',
  styleUrl: './squad-chat.scss',
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

  protected readonly quickReactions = ['▲', '🔥', '😂', '👍'];
  protected readonly draft = signal('');
  protected readonly clock = clock;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private lastNewestId: string | null = null;

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

  protected onDraft(value: string): void {
    this.draft.set(value);
    if (value.trim()) {
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
