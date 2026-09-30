import { Component, input, output } from '@angular/core';
import { PostModel } from '../../../../models/post.model';
import { SquadGameModel } from '../../../../models/squad.model';
import { clipAge, clock } from '../squad-format';

export type SquadClipSort = 'new' | 'top';

/**
 * Clips tab of the squad room, `onSquad` + `onClips` (05-squad.html L110–155):
 * "Newest" / "Top this week" sort chips, one chip per squad game (from the
 * squad's own game list, so they never disappear while filtering), a trailing
 * "＋ Upload clip", then a 3-column grid of the design's light clip cards
 * (112px thumb, centred play badge, duration chip, title, "author · time",
 * ▲ votes / 💬 comments).
 */
@Component({
  selector: 'app-squad-clips',
  templateUrl: './squad-clips.html',
  styleUrl: './squad-clips.scss',
})
export class SquadClips {
  posts = input.required<PostModel[]>();
  games = input<SquadGameModel[]>([]);
  isLoading = input(false);
  canPost = input(false);
  activeGameId = input<number | null>(null);
  sort = input<SquadClipSort>('new');

  gamePicked = output<number | null>();
  sortPicked = output<SquadClipSort>();
  upload = output<void>();
  openClip = output<PostModel>();

  protected title(post: PostModel): string {
    return post.caption?.trim() || post.gameName || 'Klip';
  }

  protected poster(post: PostModel): string | null {
    const video = post.media.find((media) => media.mediaType === 'Video');
    return video?.thumbnailUrl || post.media.find((media) => media.mediaType === 'Photo')?.url || null;
  }

  protected duration(post: PostModel): string {
    return clock(post.media.find((media) => media.mediaType === 'Video')?.durationSeconds);
  }

  protected age(iso: string): string {
    return clipAge(iso);
  }
}
