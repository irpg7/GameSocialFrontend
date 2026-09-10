import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { PostModel } from '../../../models/post.model';
import { CommentModel } from '../../../models/comment.model';
import { SquadModel } from '../../../models/squad.model';
import { LikeService } from '../../../services/like/like.service';
import { CommentService } from '../../../services/comment/comment.service';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { MeService } from '../../../services/me/me.service';
import { StarRating } from '../../../shared/star-rating/star-rating';
import { ClipStage } from '../../../shared/clip-stage/clip-stage';
import { PhotoGrid } from '../../../shared/photo-grid/photo-grid';
import { PhotoViewer } from '../../../shared/photo-viewer/photo-viewer';
import { formatTimeAgo } from '../../../shared/clip-format';

@Component({
  selector: 'app-post-card',
  imports: [DatePipe, RouterLink, FormsModule, StarRating, ClipStage, PhotoGrid, PhotoViewer],
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCard {
  private likeService = inject(LikeService);
  private commentService = inject(CommentService);
  private postService = inject(PostService);
  protected readonly authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private meService = inject(MeService);
  private router = inject(Router);

  post = input.required<PostModel>();
  /** Squads the current viewer is a member of — resolved client-side to render a "posted to X" badge, see Feed. */
  mySquads = input<SquadModel[]>([]);

  // Kept in sync with the post input, but locally mutable once the user interacts.
  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);
  protected readonly commentCount = linkedSignal(() => this.post().commentCount);
  protected readonly poll = linkedSignal(() => this.post().poll);
  protected readonly isTogglingLike = signal(false);
  protected readonly isVotingPoll = signal(false);

  protected readonly isCommentsOpen = signal(false);
  protected readonly comments = signal<CommentModel[]>([]);
  protected readonly commentsLoaded = signal(false);
  protected readonly isLoadingComments = signal(false);
  protected readonly commentsPage = signal(1);
  protected readonly hasMoreComments = signal(false);
  protected readonly newCommentBody = signal('');
  protected readonly isSubmittingComment = signal(false);

  /** Review posts vote "Useful" instead of "Like" — same PostInteraction toggle, different route/label. */
  protected readonly isUseful = computed(() => this.post().postType === 'Review');

  /**
   * Clip posts that actually carry a video render as the design's full-bleed
   * clip stage instead of the standard card. A Clip post whose video is
   * missing (a failed upload) falls back to the normal chrome rather than
   * showing an empty black stage.
   */
  protected readonly isClipCard = computed(
    () => this.post().postType === 'Clip' && this.post().media.some((media) => media.mediaType === 'Video'),
  );

  protected readonly photos = computed(() => this.post().media.filter((media) => media.mediaType === 'Photo'));

  /**
   * A Screenshots post carrying photos renders the design's photo card — the
   * full-bleed article whose adaptive grid opens into the lightbox — instead
   * of the standard card chrome. One with no usable photo (a failed upload)
   * falls back to the standard card rather than showing an empty grid.
   */
  protected readonly isPhotoCard = computed(() => this.post().postType === 'Screenshots' && this.photos().length > 0);

  /** Which tile the lightbox opened on; null while it is closed. */
  protected readonly viewerIndex = signal<number | null>(null);

  /** The design's lead-tile chip, and the mode word inside its meta line. */
  protected readonly photoKind = computed(() => (this.photos()[0]?.photoType === 'ConceptArt' ? 'concept art' : 'photo mode'));

  /** `8 photos · Vermillion Loop, photo mode · 5 h ago` — the design's meta line. */
  protected readonly photoMeta = computed(() => {
    const count = this.photos().length;
    const game = this.post().gameName;
    const subject = game ? `${game}, ${this.photoKind()}` : this.photoKind();
    return `${count} photo${count === 1 ? '' : 's'} · ${subject} · ${formatTimeAgo(this.post().createdAt)}`;
  });

  protected readonly authorInitial = computed(() => this.post().username.charAt(0).toUpperCase());

  /**
   * Only resolvable when the viewer is a member of the tagged squad — the
   * backend has no "squad name by id" lookup that bypasses membership in
   * what this app already fetches, so a squad-tagged post from a squad the
   * viewer isn't in shows no badge (silently omitted, not broken).
   */
  protected readonly squadName = computed(() => {
    const squadId = this.post().squadId;
    if (squadId == null) {
      return undefined;
    }
    return this.mySquads().find((squad) => squad.id === squadId)?.name;
  });

  /** Opens the design's lightbox on the tile that was clicked. */
  openViewer(index: number): void {
    this.viewerIndex.set(index);
  }

  closeViewer(): void {
    this.viewerIndex.set(null);
  }

  /** The clip card's "Tam ekran oynatıcı" action — hands the clip to the Clips page player. */
  openInClipsPage(): void {
    void this.router.navigate(['/clips'], { queryParams: { clip: this.post().id } });
  }

  toggleLike(): void {
    if (this.isTogglingLike()) {
      return;
    }
    this.isTogglingLike.set(true);
    const request = this.isUseful() ? this.likeService.toggleUseful(this.post().id) : this.likeService.toggleLike(this.post().id);
    request.pipe(finalize(() => this.isTogglingLike.set(false))).subscribe({
      next: (result) => {
        this.liked.set(result.liked);
        this.likeCount.set(result.likeCount);
        // A like/useful vote can award +5 XP to the post's author (self-votes
        // included) — refresh live state so the header/sidebar reflect it if applicable.
        this.meService.refresh().subscribe({ error: () => void 0 });
      },
      error: () =>
        this.notificationService.error(
          this.isUseful() ? 'Failed to update usefulness vote. Please try again.' : 'Failed to update like. Please try again.',
        ),
    });
  }

  votePoll(optionId: string): void {
    const poll = this.poll();
    if (!poll || this.isVotingPoll() || poll.isExpired) {
      return;
    }
    this.isVotingPoll.set(true);
    this.postService
      .votePoll(this.post().id, optionId)
      .pipe(finalize(() => this.isVotingPoll.set(false)))
      .subscribe({
        next: (result) => this.poll.set(result),
        error: () => this.notificationService.error('Failed to cast your vote. Please try again.'),
      });
  }

  /** Whether to show a per-option vote count/bar for the current poll state. */
  showPollResults(): boolean {
    const poll = this.poll();
    if (!poll) {
      return false;
    }
    return poll.hasCurrentUserVoted || poll.isExpired || !poll.hideResultsUntilVoted;
  }

  pollOptionPercent(voteCount: number | undefined): number {
    const poll = this.poll();
    if (!poll || !voteCount || poll.totalVotes === 0) {
      return 0;
    }
    return Math.round((voteCount / poll.totalVotes) * 100);
  }

  toggleComments(): void {
    this.isCommentsOpen.update((open) => !open);
    if (this.isCommentsOpen() && !this.commentsLoaded()) {
      this.loadComments(1);
    }
  }

  loadMoreComments(): void {
    this.loadComments(this.commentsPage() + 1);
  }

  submitComment(): void {
    const body = this.newCommentBody().trim();
    if (!body || this.isSubmittingComment()) {
      return;
    }
    this.isSubmittingComment.set(true);
    this.commentService
      .create(this.post().id, body)
      .pipe(finalize(() => this.isSubmittingComment.set(false)))
      .subscribe({
        next: (comment) => {
          this.comments.update((existing) => [...existing, comment]);
          this.commentCount.update((count) => count + 1);
          this.newCommentBody.set('');
        },
        error: () => this.notificationService.error('Failed to post comment.'),
      });
  }

  deleteComment(comment: CommentModel): void {
    this.commentService.delete(this.post().id, comment.id).subscribe({
      next: () => {
        this.comments.update((existing) => existing.filter((c) => c.id !== comment.id));
        this.commentCount.update((count) => Math.max(0, count - 1));
      },
      error: () => this.notificationService.error('Failed to delete comment.'),
    });
  }

  isOwnComment(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  private loadComments(page: number): void {
    this.isLoadingComments.set(true);
    this.commentService
      .list(this.post().id, page)
      .pipe(finalize(() => this.isLoadingComments.set(false)))
      .subscribe({
        next: (result) => {
          this.comments.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.commentsPage.set(result.page);
          this.hasMoreComments.set(result.hasMore);
          this.commentsLoaded.set(true);
        },
        error: () => this.notificationService.error('Failed to load comments.'),
      });
  }
}
