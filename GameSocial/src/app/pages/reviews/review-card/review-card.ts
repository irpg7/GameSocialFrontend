import { Component, OnInit, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [FormsModule, NgTemplateOutlet, RouterLink, StarRating, RichText],
  templateUrl: './review-card.html',
  styleUrl: './review-card.scss',
})
export class ReviewCard implements OnInit {
  private commentService = inject(CommentService);
  private likeService = inject(LikeService);
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private meService = inject(MeService);
  private notificationService = inject(NotificationService);

  readonly post = input.required<PostModel>();

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
    const ago = formatTimeAgo(this.post().createdAt);
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

  toggleUseful(): void {
    if (this.isTogglingUseful()) {
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
        error: () => this.notificationService.error('Failed to update usefulness vote. Please try again.'),
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
      error: () => this.notificationService.error('Failed to load replies.'),
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
      error: () => this.notificationService.error('Failed to update vote.'),
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
        error: () => this.notificationService.error('Failed to post comment.'),
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
        error: () => this.notificationService.error('Failed to load comments.'),
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
