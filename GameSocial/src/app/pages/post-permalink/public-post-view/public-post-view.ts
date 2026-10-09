import { Component, computed, input } from '@angular/core';
import { PostModel } from '../../../models/post.model';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { RichText } from '../../../shared/rich-text/rich-text';
import { formatCount, formatTimeAgo } from '../../../shared/clip-format';

/**
 * Read-only rendering of one post for signed-out visitors (`/posts/:id`): author, game, text, media, review score,
 * devlog title/body, poll options, counts. Nothing here calls the API — interacting needs an account.
 * Signed-in users see the real `PostCard` instead.
 */
@Component({
  selector: 'app-public-post-view',
  imports: [ImgFallback, RichText],
  templateUrl: './public-post-view.html',
  styleUrl: './public-post-view.scss',
})
export class PublicPostView {
  readonly post = input.required<PostModel>();

  protected readonly timeAgo = computed(() => formatTimeAgo(this.post().createdAt) + (this.post().editedAt ? ' · edited' : ''));
  protected readonly photos = computed(() => this.post().media.filter((m) => m.mediaType === 'Photo'));
  /** The clip itself — the best ready rendition when there is one, else the uploaded file. */
  protected readonly video = computed(() => {
    const media = this.post().media.find((m) => m.mediaType === 'Video');
    return media ? { src: media.renditions[0]?.url ?? media.url, poster: media.thumbnailUrl } : null;
  });
  protected readonly reviewScore = computed(() => {
    const score = this.post().review?.score;
    return score == null ? null : Number.isInteger(score) ? score.toFixed(1) : String(score);
  });
  /** Poll results are shown only when the author didn't hide them until voting. */
  protected readonly showPollResults = computed(() => {
    const poll = this.post().poll;
    return !!poll && (poll.isExpired || !poll.hideResultsUntilVoted);
  });
  protected readonly likeLabel = computed(() => {
    const count = formatCount(this.post().likeCount);
    return this.post().postType === 'Review' ? `${count} found useful` : `${count} likes`;
  });
  protected readonly count = formatCount;

  protected pollPercent(votes: number | undefined): number {
    const total = this.post().poll?.totalVotes ?? 0;
    return !votes || total === 0 ? 0 : Math.round((votes / total) * 100);
  }
}
