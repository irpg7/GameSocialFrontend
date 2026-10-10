import { Component, OnInit, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, of, catchError } from 'rxjs';
import { PostModel } from '../../../models/post.model';
import { CommentModel, CommentSort } from '../../../models/comment.model';
import { CommentService } from '../../../services/comment/comment.service';
import { LikeService } from '../../../services/like/like.service';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { StarRating } from '../../../shared/star-rating/star-rating';
import { RichText } from '../../../shared/rich-text/rich-text';
import { formatClock, formatTimeAgo } from '../../../shared/clip-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { PostEditSheet } from '../../../shared/post-edit-sheet/post-edit-sheet';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { ReportService } from '../../../services/safety/report.service';
import { BlockService } from '../../../services/safety/block.service';

const COMMENT_PAGE_SIZE = 3;
/** Scores at or above this read as the accent red, below as muted grey (design: 8.4/9.2 red, 5.6 grey). */
const STRONG_SCORE = 7;

/** One embedded clip tile of the "İNCELEMEDEN" strip. */
interface EmbeddedClip {
  id: string;
  duration: string;
  thumbnailUrl?: string;
}

/** A comment row plus its lazily loaded replies. */
interface ThreadComment {
  comment: CommentModel;
  replies: CommentModel[];
  repliesOpen: boolean;
}

/**
 * The Reviews page's review article (03-reviews.html L74-257): score gutter,
 * author row with LV chip, headline + rich body, "▲ n useful" / "💬 n yorum ▾" /
 * "↗ Share" pills, the embedded-clip strip, and the comment thread —
 * collapsed it previews the pinned developer reply ("◆ YAPIMCI YANITI"),
 * open it is the inset panel with sort chips, votes, replies and the composer.
 */
@Component({
  selector: 'app-review-card',
  imports: [ImgFallback, PostEditSheet, FormField, NgTemplateOutlet, RouterLink, StarRating, RichText],
  templateUrl: './review-card.html',
  styleUrls: ['./review-card.scss', './review-card.mobile.scss'],
  host: {
    '[class.is-removed]': 'removed() || authorBlocked()',
  },
})
export class ReviewCard implements OnInit {
  private commentService = inject(CommentService);
  private likeService = inject(LikeService);
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private meService = inject(MeService);
  private notificationService = inject(NotificationService);
  private reportService = inject(ReportService);
  private blockService = inject(BlockService);

  readonly postInput = input.required<PostModel>({ alias: 'post' });
  /** Local copy so the author's edit shows without a reload. */
  protected readonly post = linkedSignal(() => this.postInput());
  protected readonly isOwnPost = computed(() => this.post().userId === this.authService.currentUser()?.id);
  protected readonly removed = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly editingCommentId = signal<string | null>(null);
  protected readonly editCommentBody = signal('');
  /** Inline comment edit input (Signal Forms); the model is `editCommentBody`. */
  protected readonly editCommentField = form(this.editCommentBody, (path) => maxLength(path, 1000));

  protected readonly formatTimeAgo = formatTimeAgo;

  protected readonly useful = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly usefulCount = linkedSignal(() => this.post().likeCount);
  protected readonly commentCount = linkedSignal(() => this.post().commentCount);
  protected readonly isTogglingUseful = signal(false);

  protected readonly isThreadOpen = signal(false);
  protected readonly sort = signal<CommentSort>('top');
  protected readonly thread = signal<ThreadComment[]>([]);
  protected readonly threadTotal = signal(0);
  protected readonly threadPage = signal(1);
  protected readonly isLoadingThread = signal(false);
  protected readonly draft = signal('');
  /** Comment composer input (Signal Forms); the model is `draft`, which send() reads and clears. */
  protected readonly draftField = form(this.draft);
  protected readonly replyTo = signal<CommentModel | null>(null);
  protected readonly isPosting = signal(false);

  /** The pinned developer reply shown while the thread is collapsed. */
  protected readonly pinnedReply = signal<CommentModel | null>(null);
  protected readonly clips = signal<EmbeddedClip[]>([]);

  protected readonly review = computed(() => this.post().review!);
  protected readonly scoreLabel = computed(() => this.review().score.toFixed(1));
  protected readonly isStrongScore = computed(() => this.review().score >= STRONG_SCORE);
  protected readonly playStatusLabel = computed(() => {
    switch (this.review().playStatus) {
      case 'Finished':
        return 'finished';
      case 'StillPlaying':
        return 'still playing';
      case 'Dropped':
        return 'dropped';
      default:
        return '';
    }
  });
  protected readonly meta = computed(() => {
    const game = this.post().gameName;
    const ago = formatTimeAgo(this.post().createdAt) + (this.post().editedAt ? ' · edited' : '');
    return game ? `${game} · ${ago}` : ago;
  });
  protected readonly authorInitial = computed(() => this.post().username.charAt(0).toUpperCase());
  protected readonly shownCount = computed(() => this.thread().length);
  protected readonly remaining = computed(() => Math.max(0, this.threadTotal() - this.thread().length));
  protected readonly hasDraft = computed(() => this.draft().trim().length > 0);
  protected readonly placeholder = computed(() =>
    this.replyTo() ? `${this.replyTo()!.username} kullanıcısına yanıt yaz…` : 'Bu incelemeye yorum yaz…',
  );

  ngOnInit(): void {
    if (this.post().commentCount > 0) {
      this.commentService.list(this.post().id, 1, 1, { sort: 'top' }).subscribe({
        next: (result) => {
          const first = result.items[0];
          this.pinnedReply.set(first?.isPinned ? first : null);
        },
        error: () => void 0,
      });
    }
    this.loadClips();
  }

  onEdited(updated: PostModel): void {
    this.post.set(updated);
    this.isEditing.set(false);
  }

  /** "✕ Delete" — first click arms it, second click deletes. */
  /** Blocking the author (from a post card's menu) hides their reviews too. */
  protected readonly authorBlocked = computed(() => this.blockService.isBlocked(this.post().userId));

  reportPost(): void {
    this.reportService.open({ type: 'Post', id: this.post().id, label: `@${this.post().username}'s review` });
  }

  reportComment(comment: CommentModel): void {
    this.reportService.open({ type: 'Comment', id: comment.id, label: `@${comment.username}'s comment` });
  }

  deletePost(): void {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.postService.delete(this.post().id).subscribe({
      next: () => {
        this.removed.set(true);
        this.notificationService.success('Review deleted.');
        this.meService.refresh().subscribe({ error: () => void 0 });
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete the review.')),
    });
  }

  canDeleteComment(comment: CommentModel): boolean {
    return this.isOwn(comment) || this.isOwnPost();
  }

  deleteComment(comment: CommentModel): void {
    this.commentService.delete(this.post().id, comment.id).subscribe({
      next: () => {
        if (comment.parentCommentId) {
          this.thread.update((list) =>
            list.map((t) =>
              t.comment.id === comment.parentCommentId
                ? { ...t, comment: { ...t.comment, replyCount: Math.max(0, t.comment.replyCount - 1) }, replies: t.replies.filter((r) => r.id !== comment.id) }
                : t,
            ),
          );
        } else {
          this.thread.update((list) => list.filter((t) => t.comment.id !== comment.id));
          this.threadTotal.update((n) => Math.max(0, n - 1));
          this.pinnedReply.update((p) => (p?.id === comment.id ? null : p));
        }
        this.commentCount.update((n) => Math.max(0, n - 1));
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete the comment.')),
    });
  }

  startEditComment(comment: CommentModel): void {
    this.editingCommentId.set(comment.id);
    this.editCommentBody.set(comment.body);
  }

  saveEditComment(comment: CommentModel): void {
    const body = this.editCommentBody().trim();
    if (!body) {
      return;
    }
    this.commentService.update(this.post().id, comment.id, body).subscribe({
      next: (updated) => {
        const apply = (c: CommentModel): CommentModel => (c.id === comment.id ? { ...c, body: updated.body, editedAt: updated.editedAt } : c);
        this.thread.update((list) => list.map((t) => ({ ...t, comment: apply(t.comment), replies: t.replies.map(apply) })));
        this.pinnedReply.update((p) => (p ? apply(p) : p));
        this.editingCommentId.set(null);
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to edit the comment.')),
    });
  }

  toggleUseful(): void {
    if (this.isTogglingUseful() || this.isOwnPost()) {
      return;
    }
    this.isTogglingUseful.set(true);
    this.likeService
      .toggleUseful(this.post().id)
      .pipe(finalize(() => this.isTogglingUseful.set(false)))
      .subscribe({
        next: (result) => {
          this.useful.set(result.liked);
          this.usefulCount.set(result.likeCount);
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update usefulness vote. Please try again.')),
      });
  }

  toggleThread(): void {
    const open = !this.isThreadOpen();
    this.isThreadOpen.set(open);
    this.draft.set('');
    this.replyTo.set(null);
    if (open && this.thread().length === 0) {
      this.loadThread(1);
    }
  }

  /** "↩ Yanıtla" on the collapsed pinned reply: open the thread aimed at it. */
  replyToPinned(): void {
    const pinned = this.pinnedReply();
    if (!this.isThreadOpen()) {
      this.toggleThread();
    }
    this.replyTo.set(pinned);
  }

  setSort(sort: CommentSort): void {
    if (this.sort() === sort) {
      return;
    }
    this.sort.set(sort);
    this.loadThread(1);
  }

  loadMore(): void {
    this.loadThread(this.threadPage() + 1);
  }

  startReply(comment: CommentModel): void {
    this.replyTo.set(comment);
  }

  cancelReply(): void {
    this.replyTo.set(null);
  }

  toggleReplies(item: ThreadComment): void {
    if (item.repliesOpen) {
      this.patch(item.comment.id, { repliesOpen: false });
      return;
    }
    this.commentService.list(this.post().id, 1, 50, { sort: 'oldest', parentCommentId: item.comment.id }).subscribe({
      next: (result) => this.patch(item.comment.id, { replies: result.items, repliesOpen: true }),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load replies.')),
    });
  }

  vote(comment: CommentModel): void {
    this.commentService.toggleVote(this.post().id, comment.id).subscribe({
      next: (result) => {
        const apply = (c: CommentModel): CommentModel =>
          c.id === comment.id ? { ...c, isVotedByCurrentUser: result.voted, voteCount: result.voteCount } : c;
        this.thread.update((list) =>
          list.map((t) => ({ ...t, comment: apply(t.comment), replies: t.replies.map(apply) })),
        );
        this.pinnedReply.update((p) => (p ? apply(p) : p));
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update vote.')),
    });
  }

  send(): void {
    const body = this.draft().trim();
    if (!body || this.isPosting()) {
      return;
    }
    const target = this.replyTo();
    const parentId = target ? (target.parentCommentId ?? target.id) : undefined;
    this.isPosting.set(true);
    this.commentService
      .create(this.post().id, body, { parentCommentId: parentId })
      .pipe(finalize(() => this.isPosting.set(false)))
      .subscribe({
        next: (comment) => {
          this.commentCount.update((n) => n + 1);
          this.draft.set('');
          this.replyTo.set(null);
          if (parentId) {
            const parent = this.thread().find((t) => t.comment.id === parentId);
            if (parent) {
              this.patch(parentId, {
                comment: { ...parent.comment, replyCount: parent.comment.replyCount + 1 },
                replies: [...parent.replies, comment],
                repliesOpen: true,
              });
            }
          } else {
            // Design: posting flips the thread to "En yeni" with your comment on top.
            this.sort.set('new');
            this.loadThread(1);
          }
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to post comment.')),
      });
  }

  isOwn(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  share(): void {
    const url = `${location.origin}/reviews${this.post().gameId ? `?game=${this.post().gameId}` : ''}`;
    const title = this.post().caption ?? 'Review';
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => void 0);
      return;
    }
    navigator.clipboard
      ?.writeText(url)
      .then(() => this.notificationService.success('Link copied.'))
      .catch(() => this.notificationService.error('Could not copy the link.'));
  }

  private loadThread(page: number): void {
    this.isLoadingThread.set(true);
    this.commentService
      .list(this.post().id, page, COMMENT_PAGE_SIZE, { sort: this.sort() })
      .pipe(finalize(() => this.isLoadingThread.set(false)))
      .subscribe({
        next: (result) => {
          const rows = result.items.map((comment) => ({ comment, replies: [], repliesOpen: false }));
          this.thread.update((existing) => (page === 1 ? rows : [...existing, ...rows]));
          this.threadPage.set(result.page);
          this.threadTotal.set(result.totalCount);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load comments.')),
      });
  }

  private patch(commentId: string, change: Partial<ThreadComment>): void {
    this.thread.update((list) => list.map((t) => (t.comment.id === commentId ? { ...t, ...change } : t)));
  }

  private loadClips(): void {
    const ids = this.post().review?.embeddedClipPostIds ?? [];
    if (ids.length === 0) {
      return;
    }
    forkJoin(ids.map((id) => this.postService.getPost(id).pipe(catchError(() => of(null))))).subscribe((posts) => {
      this.clips.set(
        posts
          .filter((p): p is PostModel => p !== null)
          .map((p) => {
            const video = p.media.find((m) => m.mediaType === 'Video');
            return { id: p.id, duration: formatClock(video?.durationSeconds), thumbnailUrl: video?.thumbnailUrl };
          }),
      );
    });
  }
}
