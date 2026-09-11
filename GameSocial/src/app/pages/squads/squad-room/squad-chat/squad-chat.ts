import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LowerCasePipe, UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SquadMessageModel } from '../../../../models/squad.model';

interface MessageDayGroup {
  /** `Today` / `Yesterday` / a short date, as the design's chat divider. */
  label: string;
  messages: SquadMessageModel[];
}

/**
 * Chat tab of the squad room, from Gamer Feed.dc.html `onSquad` + `onChat`:
 * a `#channel ——— Today` divider, message rows carrying the author's level
 * chip, shared clips rendered as a large inline card with a SQUAD CLIP badge,
 * and a composer row with clip / screenshot / send actions.
 *
 * Two mock elements are left out because nothing backs them: the per-message
 * reaction chips (▲ 4 / 🔥 2 — squad messages have no reactions) and the
 * achievement/system rows ("squad earned +300 XP" — there is no squad event
 * feed). The mock's "Push to main feed →" link becomes "View in feed": a post
 * tagged to a squad is already in the main feed, so there is nothing to push.
 */
@Component({
  selector: 'app-squad-chat',
  imports: [FormsModule, RouterLink, LowerCasePipe, UpperCasePipe],
  templateUrl: './squad-chat.html',
  styleUrl: './squad-chat.scss',
})
export class SquadChat {
  channelName = input<string | undefined>(undefined);
  messages = input.required<SquadMessageModel[]>();
  /** userId → level, merged from the squad leaderboard (server-computed). */
  levels = input<Record<string, number>>({});
  isMember = input(false);
  isLoading = input(false);
  hasMore = input(false);
  isSending = input(false);
  /** Drives the composer row's avatar. */
  currentUsername = input<string | undefined>(undefined);

  send = output<string>();
  loadEarlier = output<void>();
  togglePin = output<SquadMessageModel>();
  attachClip = output<void>();
  attachScreens = output<void>();

  protected readonly draft = signal('');

  /**
   * Messages arrive oldest-first, so the groups come out in reading order and
   * the first group's label is the one the channel header shows (matching the
   * design, which prints the day once beside the channel name).
   */
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

  protected initial(name: string | undefined): string {
    return (name ?? '').charAt(0).toUpperCase();
  }

  protected level(userId: string): number | null {
    return this.levels()[userId] ?? null;
  }

  /** `21:04` — the design's message timestamp. */
  protected time(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    return date.toLocaleDateString();
  }
}
