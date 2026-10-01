import { Component, ElementRef, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { PostMediaModel, PostModel } from '../../../models/post.model';
import { CommentModel, CommentSort } from '../../../models/comment.model';
import { SquadModel } from '../../../models/squad.model';
import { LikeService } from '../../../services/like/like.service';
import { CommentService } from '../../../services/comment/comment.service';
import { PostService } from '../../../services/post/post.service';
import { FollowService } from '../../../services/follow/follow.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { MeService } from '../../../services/me/me.service';
import { StarRating } from '../../../shared/star-rating/star-rating';
import { ClipStage } from '../../../shared/clip-stage/clip-stage';
import { PhotoGrid } from '../../../shared/photo-grid/photo-grid';
import { PhotoViewer } from '../../../shared/photo-viewer/photo-viewer';
import { RichText } from '../../../shared/rich-text/rich-text';
import { PostEditSheet } from '../../../shared/post-edit-sheet/post-edit-sheet';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { formatClock, formatCount, formatTimeAgo } from '../../../shared/clip-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

/** How many comments the featured clip's "Öne çıkan yorumlar" block shows. */
const FEATURED_COMMENTS = 3;

/** A top-level comment's lazily loaded replies (one level deep). */
interface ReplyThread {
  open: boolean;
  loading: boolean;
  items: CommentModel[];
}

/**
 * One post in the feed, drawn per type exactly as Gamer Feed.dc.html does:
 *  - Clip: the clip-stage `feed` stage with the "Öne çıkan yorumlar" top-3
 *    thread for every clip — `featured` only changes the badge ("CLIP OF THE
 *    DAY" vs "CLIP"). The ··· menu sits among the stage's buttons.
 *  - Devlog: the accent-bordered developer card (DEVLOG #n, build chip,
 *    IN ENGINE / before / after band, "Next patch", test-branch CTA).
 *  - Review: cover + score gutter, headline, body, "Add your rating".
 *  - Screenshots: meta row, adaptive photo grid + lightbox, Save all.
 *  - Poll: the same card chrome with vote bars.
 */
@Component({
  selector: 'app-post-card',
  imports: [ImgFallback, PostEditSheet, NgTemplateOutlet, RouterLink, StarRating, ClipStage, PhotoGrid, PhotoViewer, RichText],
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
  host: {
    '(document:click)': 'menuOpen.set(false); confirmingDelete.set(false)',
    '[class.is-removed]': 'removed()',
  },
})
export class PostCard {
  private likeService = inject(LikeService);
  private commentService = inject(CommentService);
  private postService = inject(PostService);
  private followService = inject(FollowService);
  protected readonly authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private meService = inject(MeService);
  private router = inject(Router);

  readonly postInput = input.required<PostModel>({ alias: 'post' });
  /** Local copy so an edit made from the ··· menu shows without a reload. */
  protected readonly post = linkedSignal(() => this.postInput());
  /** Set after "Delete post" — the card hides itself (parents don't need to drop it). */
  protected readonly removed = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly editingCommentId = signal<string | null>(null);
  protected readonly editCommentBody = signal('');
  /** Squads the current viewer is a member of — resolved client-side to render a "posted to X" badge, see Feed. */
  mySquads = input<SquadModel[]>([]);
  /** The feed's hero: "CLIP OF THE DAY" stage + featured comment thread. */
  featured = input(false);

  private readonly stage = viewChild(ClipStage);
  private readonly commentInput = viewChild<ElementRef<HTMLTextAreaElement>>('commentInput');

  // Kept in sync with the post input, but locally mutable once the user interacts.
  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);
  protected readonly commentCount = linkedSignal(() => this.post().commentCount);
  protected readonly saved = linkedSignal(() => this.post().isSavedByCurrentUser);
  protected readonly followingAuthor = linkedSignal(() => this.post().isAuthorFollowedByCurrentUser);
  protected readonly poll = linkedSignal(() => this.post().poll);
  protected readonly isTogglingLike = signal(false);
  protected readonly isVotingPoll = signal(false);
  protected readonly menuOpen = signal(false);

  protected readonly isCommentsOpen = signal(false);
  protected readonly comments = signal<CommentModel[]>([]);
  protected readonly commentsLoaded = signal(false);
  protected readonly isLoadingComments = signal(false);
  protected readonly commentsPage = signal(1);
  protected readonly hasMoreComments = signal(false);
  protected readonly newCommentBody = signal('');
  protected readonly isSubmittingComment = signal(false);
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly replyBody = signal('');
  protected readonly replyThreads = signal<Record<string, ReplyThread>>({});

  protected readonly isOwnPost = computed(() => this.post().userId === this.authService.currentUser()?.id);
  protected readonly timeAgo = computed(() => formatTimeAgo(this.post().createdAt) + (this.post().editedAt ? ' · edited' : ''));
  protected readonly likeLabel = computed(() => formatCount(this.likeCount()));
  protected readonly commentLabel = computed(() => formatCount(this.commentCount()));

  /** Clip posts that actually carry a video render a clip stage; a failed upload falls back to the generic card. */
  protected readonly isClipCard = computed(
    () => this.post().postType === 'Clip' && this.post().media.some((media) => media.mediaType === 'Video'),
  );
  protected readonly isFeaturedClip = computed(() => this.featured() && this.isClipCard());
  protected readonly isDevlogCard = computed(() => this.post().postType === 'Devlog' && this.post().devlog != null);
  protected readonly isReviewCard = computed(() => this.post().postType === 'Review' && this.post().review != null);
  protected readonly isPollCard = computed(() => this.post().postType === 'Poll' && this.post().poll != null);

  /** Review posts vote "Useful" instead of "Like" — same PostInteraction toggle, different route. */
  protected readonly isUseful = computed(() => this.post().postType === 'Review');

  protected readonly photos = computed(() => this.post().media.filter((media) => media.mediaType === 'Photo'));
  protected readonly isPhotoCard = computed(() => this.post().postType === 'Screenshots' && this.photos().length > 0);
  protected readonly viewerIndex = signal<number | null>(null);

  protected readonly photoKind = computed(() => (this.photos()[0]?.photoType === 'ConceptArt' ? 'concept art' : 'photo mode'));

  /** The lead tile's chip ("4K · HDR" in the design): the real resolution class of the first photo. */
  protected readonly photoBadge = computed(() => {
    const lead = this.photos()[0];
    const width = Math.max(lead?.width ?? 0, lead?.height ?? 0);
    if (width >= 3840) return '4K';
    if (width >= 2560) return '1440p';
    if (width >= 1920) return '1080p';
    return this.photoKind().toUpperCase();
  });

  /** `8 photos · Vermillion Loop, photo mode · 5 h ago`. */
  protected readonly photoMeta = computed(() => {
    const count = this.photos().length;
    const game = this.post().gameName;
    const subject = game ? `${game}, ${this.photoKind()}` : this.photoKind();
    return `${count} photo${count === 1 ? '' : 's'} · ${subject} · ${this.timeAgo()}`;
  });

  /** `reviewed Ashfall · 1 h ago`. */
  protected readonly reviewMeta = computed(() => {
    const game = this.post().gameName;
    return `${game ? `reviewed ${game}` : 'reviewed'} · ${this.timeAgo()}`;
  });

  protected readonly reviewScore = computed(() => {
    const score = this.post().review?.score ?? 0;
    return Number.isInteger(score) ? score.toFixed(1) : String(score);
  });

  /** Devlog header meta: `Ashfall — the team behind it · 2 h ago`. */
  protected readonly devlogMeta = computed(() => {
    const game = this.post().gameName;
    return `${game ? `${game} — the team behind it · ` : ''}${this.timeAgo()}`;
  });

  /** `BUILD 0.9.4 · TEST BRANCH` — the design folds both tags into one chip. */
  protected readonly buildChip = computed(() => {
    const devlog = this.post().devlog;
    const parts = [devlog?.buildTag ? `BUILD ${devlog.buildTag}` : '', devlog?.branchTag ?? ''].filter(Boolean);
    return parts.join(' · ').toUpperCase();
  });

  /** The devlog media band: the IN ENGINE lead plus up to two side frames (before/after, or just the next two). */
  protected readonly devlogMedia = computed(() => {
    const media = this.post().media;
    const lead = media.find((m) => m.role === 'InEngine') ?? media.find((m) => m.role == null) ?? media[0];
    const before = media.find((m) => m.role === 'Before');
    const after = media.find((m) => m.role === 'After');
    const side = before || after ? [before, after].filter((m): m is PostMediaModel => !!m) : media.filter((m) => m !== lead).slice(0, 2);
    return { lead, side: side.filter((m) => m !== lead) };
  });

  protected readonly squadName = computed(() => {
    const squadId = this.post().squadId;
    return squadId == null ? undefined : this.mySquads().find((squad) => squad.id === squadId)?.name;
  });

  /** Featured thread: the top three by votes (pinned developer replies first, from the server). */
  protected readonly featuredComments = computed(() => this.comments().slice(0, FEATURED_COMMENTS));

  protected readonly clock = formatClock;
  protected readonly ago = formatTimeAgo;
  protected readonly count = formatCount;

  openViewer(index: number): void {
    this.viewerIndex.set(index);
  }

  closeViewer(): void {
    this.viewerIndex.set(null);
  }

  /** "Tüm N yorumu gör →" — the Clips page with the comments rail open. */
  openClipComments(): void {
    void this.router.navigate(['/clips'], { queryParams: { clip: this.post().id, rail: 'comments' } });
  }

  /** "@0:12" stamp: seek the card's own player there and play. */
  seekComment(comment: CommentModel): void {
    if (comment.timestampSeconds == null) {
      return;
    }
    this.stage()?.seekTo(comment.timestampSeconds, true);
  }

  /** "✎ Edit post" (author only). */
  startEdit(): void {
    this.menuOpen.set(false);
    this.isEditing.set(true);
  }

  onEdited(updated: PostModel): void {
    this.post.set(updated);
    this.isEditing.set(false);
  }

  /** "✕ Delete post" — first click arms it, second click deletes. */
  deletePost(): void {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    if (this.isDeleting()) {
      return;
    }
    this.isDeleting.set(true);
    this.postService
      .delete(this.post().id)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.menuOpen.set(false);
          this.removed.set(true);
          this.notificationService.success('Post deleted.');
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete the post.')),
      });
  }

  /** "Düzenle" on your own comment. */
  startEditComment(comment: CommentModel): void {
    this.editingCommentId.set(comment.id);
    this.editCommentBody.set(comment.body);
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
  }

  saveEditComment(comment: CommentModel): void {
    const body = this.editCommentBody().trim();
    if (!body) {
      return;
    }
    this.commentService.update(this.post().id, comment.id, body).subscribe({
      next: (updated) => {
        this.updateComment(comment, (c) => ({ ...c, body: updated.body, editedAt: updated.editedAt }));
        this.editingCommentId.set(null);
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to edit the comment.')),
    });
  }

  toggleLike(): void {
    if (this.isTogglingLike() || this.isOwnPost()) {
      return;
    }
    this.isTogglingLike.set(true);
    const request = this.isUseful() ? this.likeService.toggleUseful(this.post().id) : this.likeService.toggleLike(this.post().id);
    request.pipe(finalize(() => this.isTogglingLike.set(false))).subscribe({
      next: (result) => {
        this.liked.set(result.liked);
        this.likeCount.set(result.likeCount);
        this.meService.refresh().subscribe({ error: () => void 0 });
      },
      error: () => this.notificationService.error('Failed to update your vote. Please try again.'),
    });
  }

  toggleSave(): void {
    const next = !this.saved();
    this.saved.set(next);
    this.postService.toggleSave(this.post().id).subscribe({
      next: (result) => {
        this.saved.set(result.saved);
        this.meService.refresh().subscribe({ error: () => void 0 });
      },
      error: () => {
        this.saved.set(!next);
        this.notificationService.error('Failed to save the post.');
      },
    });
  }

  /** "Follow updates" on a developer's devlog = follow the developer. */
  toggleFollowAuthor(): void {
    const next = !this.followingAuthor();
    this.followingAuthor.set(next);
    this.followService.toggleUserFollow(this.post().userId).subscribe({
      next: (result) => this.followingAuthor.set(result.following),
      error: () => {
        this.followingAuthor.set(!next);
        this.notificationService.error('Failed to update follow status.');
      },
    });
  }

  /** "↗ Share": copies the post's link (the Clips page for clips, the Feed filtered to the author otherwise). */
  async share(): Promise<void> {
    this.menuOpen.set(false);
    const post = this.post();
    const path = post.postType === 'Clip' ? `/clips?clip=${post.id}` : `/feed?user=${post.userId}`;
    const url = `${location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notificationService.success('Bağlantı kopyalandı.');
    } catch {
      this.notificationService.info(url);
    }
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  /** "Report a bug" on a devlog: open the thread with a bug-report comment started. */
  reportBug(): void {
    if (!this.isCommentsOpen()) {
      this.toggleComments();
    }
    if (!this.newCommentBody().startsWith('Bug: ')) {
      this.newCommentBody.set('Bug: ' + this.newCommentBody());
    }
    setTimeout(() => this.commentInput()?.nativeElement.focus());
  }

  /** "Add your rating" → the Reviews page for this game. */
  addRating(): void {
    void this.router.navigate(['/reviews'], { queryParams: this.post().gameId ? { game: this.post().gameId } : {} });
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

  /** `Ends in 3 h` / `Ends in 2 d` for an open poll. */
  endsIn(iso: string): string {
    const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
    if (minutes < 60) {
      return `Ends in ${minutes} min`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `Ends in ${hours} h` : `Ends in ${Math.round(hours / 24)} d`;
  }

  showPollResults(): boolean {
    const poll = this.poll();
    return !!poll && (poll.hasCurrentUserVoted || poll.isExpired || !poll.hideResultsUntilVoted);
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
    const timestampSeconds = this.isClipCard() ? this.stage()?.currentSeconds() : undefined;
    this.commentService
      .create(this.post().id, body, { timestampSeconds: timestampSeconds ? Math.floor(timestampSeconds) : undefined })
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

  startReply(comment: CommentModel): void {
    this.replyingTo.set(this.replyingTo() === comment.id ? null : comment.id);
    this.replyBody.set('');
  }

  submitReply(comment: CommentModel): void {
    const body = this.replyBody().trim();
    if (!body || this.isSubmittingComment()) {
      return;
    }
    // Replying to a reply attaches to its top-level parent.
    const parentId = comment.parentCommentId ?? comment.id;
    this.isSubmittingComment.set(true);
    this.commentService
      .create(this.post().id, body, { parentCommentId: parentId })
      .pipe(finalize(() => this.isSubmittingComment.set(false)))
      .subscribe({
        next: (reply) => {
          this.comments.update((existing) => existing.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c)));
          const thread = this.replyThreads()[parentId];
          if (thread?.items.length || thread?.open) {
            this.patchThread(parentId, { open: true, items: [...thread.items, reply] });
          } else {
            this.loadReplies(parentId);
          }
          this.commentCount.update((count) => count + 1);
          this.replyingTo.set(null);
          this.replyBody.set('');
        },
        error: () => this.notificationService.error('Failed to post reply.'),
      });
  }

  /** "N yanıt" / "Yanıtları gizle" under a top-level comment. */
  toggleReplies(comment: CommentModel): void {
    if (this.replyThreads()[comment.id]?.open) {
      this.patchThread(comment.id, { open: false });
      return;
    }
    this.loadReplies(comment.id);
  }

  voteComment(comment: CommentModel): void {
    this.commentService.toggleVote(this.post().id, comment.id).subscribe({
      next: (result) =>
        this.updateComment(comment, (c) => ({ ...c, isVotedByCurrentUser: result.voted, voteCount: result.voteCount })),
      error: () => this.notificationService.error('Failed to vote.'),
    });
  }

  deleteComment(comment: CommentModel): void {
    this.commentService.delete(this.post().id, comment.id).subscribe({
      next: () => {
        const parentId = comment.parentCommentId;
        if (parentId) {
          const thread = this.replyThreads()[parentId];
          if (thread) {
            this.patchThread(parentId, { items: thread.items.filter((r) => r.id !== comment.id) });
          }
          this.comments.update((existing) =>
            existing.map((c) => (c.id === parentId ? { ...c, replyCount: Math.max(0, c.replyCount - 1) } : c)),
          );
        } else {
          this.comments.update((existing) => existing.filter((c) => c.id !== comment.id));
        }
        this.commentCount.update((count) => Math.max(0, count - 1));
      },
      error: () => this.notificationService.error('Failed to delete comment.'),
    });
  }

  isOwnComment(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  private loadComments(page: number): void {
    // The featured clip shows its top comments; every other thread reads oldest-first.
    // Clip cards show their top comments ("Öne çıkan yorumlar"); every other thread reads oldest-first.
    const sort: CommentSort = this.isClipCard() ? 'top' : 'oldest';
    const pageSize = this.isClipCard() ? FEATURED_COMMENTS : 20;
    this.isLoadingComments.set(true);
    this.commentService
      .list(this.post().id, page, pageSize, { sort })
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

  private loadReplies(parentId: string): void {
    this.patchThread(parentId, { open: true, loading: true });
    this.commentService.list(this.post().id, 1, 50, { parentCommentId: parentId }).subscribe({
      next: (result) => this.patchThread(parentId, { loading: false, items: result.items }),
      error: () => {
        this.patchThread(parentId, { open: false, loading: false });
        this.notificationService.error('Failed to load replies.');
      },
    });
  }

  private patchThread(id: string, patch: Partial<ReplyThread>): void {
    this.replyThreads.update((threads) => ({
      ...threads,
      [id]: { ...(threads[id] ?? { open: false, loading: false, items: [] }), ...patch },
    }));
  }

  /** Applies a change to a comment wherever it lives — the top-level list or a reply thread. */
  private updateComment(comment: CommentModel, apply: (c: CommentModel) => CommentModel): void {
    const parentId = comment.parentCommentId;
    if (!parentId) {
      this.comments.update((existing) => existing.map((c) => (c.id === comment.id ? apply(c) : c)));
      return;
    }
    const thread = this.replyThreads()[parentId];
    if (thread) {
      this.patchThread(parentId, { items: thread.items.map((r) => (r.id === comment.id ? apply(r) : r)) });
    }
  }
}
