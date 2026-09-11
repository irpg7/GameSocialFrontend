import { Component, computed, input, output } from '@angular/core';
import { PostModel } from '../../../../models/post.model';
import { ClipQueueCard } from '../../../clips/clip-queue-card/clip-queue-card';

interface GameFilter {
  id: number | null;
  label: string;
}

/**
 * Clips tab of the squad room, from Gamer Feed.dc.html `onSquad` + `onClips`:
 * a filter chip row with a trailing upload action, then a three-column grid of
 * compact clip cards.
 *
 * The cards are the existing `app-clip-queue-card` (same design language: a
 * centred red play badge, a duration chip, title, author, vote/comment chips),
 * only re-laid-out for a grid instead of the Clips page rail.
 *
 * The mock's "Top this week" sort chip is omitted: the posts endpoint is fixed
 * to newest-first and has no sort parameter. The game chips are real, derived
 * from the clips actually posted to this squad.
 */
@Component({
  selector: 'app-squad-clips',
  imports: [ClipQueueCard],
  templateUrl: './squad-clips.html',
  styleUrl: './squad-clips.scss',
})
export class SquadClips {
  posts = input.required<PostModel[]>();
  totalCount = input(0);
  isLoading = input(false);
  canPost = input(false);
  /** null = "All"; otherwise a game id. */
  activeGameId = input<number | null>(null);

  gamePicked = output<number | null>();
  upload = output<void>();
  openClip = output<PostModel>();

  protected readonly filters = computed<GameFilter[]>(() => {
    const seen = new Map<number, string>();
    for (const post of this.posts()) {
      if (post.gameId != null && post.gameName) {
        seen.set(post.gameId, post.gameName);
      }
    }
    return [
      { id: null, label: `All ${this.totalCount()}` },
      ...[...seen.entries()].map(([id, label]) => ({ id, label })),
    ];
  });
}
