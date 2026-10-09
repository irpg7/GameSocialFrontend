import { Component, computed, input, output } from '@angular/core';
import { SquadMessageModel } from '../../../../models/squad.model';
import { BottomSheet } from '../../../../shared/bottom-sheet/bottom-sheet';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { clockTime } from '../squad-format';

/** Backend `SquadReactionRules.Allowed` — the server rejects anything else. */
export const SQUAD_REACTIONS = ['▲', '🔥', '😂', '👍', '❤️', '😮', 'GG'] as const;

/**
 * Phone message actions (prototype "Oda · mesaj eylemleri"): long-pressing a chat message opens this
 * sheet instead of the desktop hover strip — a preview of the message, all seven reactions, then pin,
 * copy and the author's profile.
 */
@Component({
  selector: 'app-squad-message-sheet',
  imports: [BottomSheet, ImgFallback],
  templateUrl: './squad-message-sheet.html',
  styleUrl: './squad-message-sheet.scss',
})
export class SquadMessageSheet {
  message = input.required<SquadMessageModel>();
  canReact = input(false);
  canPin = input(false);
  /** Server: only a captain or the author may unpin. */
  canUnpin = input(false);
  /** Başkasının mesajı → "Mesajı bildir". */
  canReport = input(false);

  react = output<string>();
  togglePin = output<void>();
  copy = output<void>();
  viewProfile = output<void>();
  report = output<void>();
  closed = output<void>();

  protected readonly reactions = SQUAD_REACTIONS;

  protected readonly time = computed(() => clockTime(this.message().createdAt));

  protected readonly preview = computed(() => {
    const message = this.message();
    return message.body ?? (message.sharedPost?.caption || 'Paylaşılan gönderi');
  });

  protected readonly showPin = computed(() => (this.message().isPinned ? this.canUnpin() : this.canPin()));

  protected mine(emoji: string): boolean {
    return this.message().reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByCurrentUser);
  }

  protected reactionLabel(emoji: string): string {
    return `${emoji} tepkisi`;
  }
}
