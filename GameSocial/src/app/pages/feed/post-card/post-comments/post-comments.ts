import { Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CommentModel, CommentSort } from '../../../../models/comment.model';
import { CommentService } from '../../../../services/comment/comment.service';
import { AuthService } from '../../../../services/auth/auth.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { formatClock, formatCount, formatTimeAgo } from '../../../../shared/clip-format';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { ReportService } from '../../../../services/safety/report.service';

/** How many comments the clip card's "Öne çıkan yorumlar" block shows. */
const FEATURED_COMMENTS = 3;

/** A top-level comment's lazily loaded replies (one level deep). */
interface ReplyThread {
  open: boolean;
  loading: boolean;
  items: CommentModel[];
}

/**
 * A post card's comments, loaded when the card opens them:
 *  - `featured` (clip cards): the design's "Öne çıkan yorumlar" — the top three by votes (pinned
 *    developer replies first, from the server), @stamps that seek the card's player, and a link to
 *    the Clips page's full rail. No composer.
 *  - `thread` (every other card): the full thread, oldest first, paged, with the comment box.
 * Every row can be voted, replied to (one level), edited by its author and deleted by its author or
 * the post's owner. Count changes go out through `countChange` so the card's 💬 label follows.
 */
@Component({
  selector: 'app-post-comments',
  imports: [ImgFallback, NgTemplateOutlet, RouterLink],
  templateUrl: './post-comments.html',
  styleUrl: './post-comments.scss',
})
export class PostComments implements OnInit {
  private commentService = inject(CommentService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private reportService = inject(ReportService);

  postId = input.required<string>();
  /** The post's author may delete anyone's comment on it. */
  isOwnPost = input(false);
  variant = input<'featured' | 'thread'>('thread');
  /** "Tüm N yorumu gör →" (featured). */
  totalLabel = input('');
  countChange = output<number>();
  /** An @stamp was clicked (featured clip cards). */
  seek = output<number>();
  /** "Tüm N yorumu gör →". */
  openAll = output<void>();

  private readonly commentInput = viewChild<ElementRef<HTMLTextAreaElement>>('commentInput');

  protected readonly comments = signal<CommentModel[]>([]);
  protected readonly isLoading = signal(false);
  private readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly newCommentBody = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly replyBody = signal('');
  protected readonly replyThreads = signal<Record<string, ReplyThread>>({});
  protected readonly editingCommentId = signal<string | null>(null);
  protected readonly editCommentBody = signal('');

  protected readonly isFeatured = computed(() => this.variant() === 'featured');
  protected readonly featuredComments = computed(() => this.comments().slice(0, FEATURED_COMMENTS));

  protected readonly clock = formatClock;
  protected readonly ago = formatTimeAgo;
  protected readonly count = formatCount;

  ngOnInit(): void {
    this.load(1);
  }

  /** Devlog "Report a bug": start a bug-report comment and focus the box. */
  startBugReport(): void {
    if (!this.newCommentBody().startsWith('Bug: ')) {
      this.newCommentBody.set('Bug: ' + this.newCommentBody());
    }
    setTimeout(() => this.commentInput()?.nativeElement.focus());
  }

  protected loadMore(): void {
    this.load(this.page() + 1);
  }

  protected reportComment(comment: CommentModel): void {
    this.reportService.open({ type: 'Comment', id: comment.id, label: `@${comment.username}'s comment` });
  }

  protected isOwnComment(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  protected submitComment(): void {
    const body = this.newCommentBody().trim();
    if (!body || this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.commentService
      .create(this.postId(), body)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (comment) => {
          this.comments.update((existing) => [...existing, comment]);
          this.countChange.emit(1);
          this.newCommentBody.set('');
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to post comment.')),
      });
  }

  protected startReply(comment: CommentModel): void {
    this.replyingTo.set(this.replyingTo() === comment.id ? null : comment.id);
    this.replyBody.set('');
  }

  protected submitReply(comment: CommentModel): void {
    const body = this.replyBody().trim();
    if (!body || this.isSubmitting()) {
      return;
    }
    // Replying to a reply attaches to its top-level parent.
    const parentId = comment.parentCommentId ?? comment.id;
    this.isSubmitting.set(true);
    this.commentService
      .create(this.postId(), body, { parentCommentId: parentId })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (reply) => {
          this.comments.update((existing) => existing.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c)));
          const thread = this.replyThreads()[parentId];
          if (thread?.items.length || thread?.open) {
            this.patchThread(parentId, { open: true, items: [...thread.items, reply] });
          } else {
            this.loadReplies(parentId);
          }
          this.countChange.emit(1);
          this.replyingTo.set(null);
          this.replyBody.set('');
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to post reply.')),
      });
  }

  /** "N yanıt" / "Yanıtları gizle" under a top-level comment. */
  protected toggleReplies(comment: CommentModel): void {
    if (this.replyThreads()[comment.id]?.open) {
      this.patchThread(comment.id, { open: false });
      return;
    }
    this.loadReplies(comment.id);
  }

  protected voteComment(comment: CommentModel): void {
    this.commentService.toggleVote(this.postId(), comment.id).subscribe({
      next: (result) =>
        this.updateComment(comment, (c) => ({ ...c, isVotedByCurrentUser: result.voted, voteCount: result.voteCount })),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to vote.')),
    });
  }

  protected deleteComment(comment: CommentModel): void {
    this.commentService.delete(this.postId(), comment.id).subscribe({
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
        this.countChange.emit(-1);
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete comment.')),
    });
  }

  /** "Düzenle" on your own comment. */
  protected startEditComment(comment: CommentModel): void {
    this.editingCommentId.set(comment.id);
    this.editCommentBody.set(comment.body);
  }

  protected cancelEditComment(): void {
    this.editingCommentId.set(null);
  }

  protected saveEditComment(comment: CommentModel): void {
    const body = this.editCommentBody().trim();
    if (!body) {
      return;
    }
    this.commentService.update(this.postId(), comment.id, body).subscribe({
      next: (updated) => {
        this.updateComment(comment, (c) => ({ ...c, body: updated.body, editedAt: updated.editedAt }));
        this.editingCommentId.set(null);
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to edit the comment.')),
    });
  }

  private load(page: number): void {
    // Clip cards show their top comments ("Öne çıkan yorumlar"); every other thread reads oldest-first.
    const sort: CommentSort = this.isFeatured() ? 'top' : 'oldest';
    const pageSize = this.isFeatured() ? FEATURED_COMMENTS : 20;
    this.isLoading.set(true);
    this.commentService
      .list(this.postId(), page, pageSize, { sort })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.comments.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load comments.')),
      });
  }

  private loadReplies(parentId: string): void {
    this.patchThread(parentId, { open: true, loading: true });
    this.commentService.list(this.postId(), 1, 50, { parentCommentId: parentId }).subscribe({
      next: (result) => this.patchThread(parentId, { loading: false, items: result.items }),
      error: (err: unknown) => {
        this.patchThread(parentId, { open: false, loading: false });
        this.notificationService.error(extractApiErrorMessage(err, 'Failed to load replies.'));
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
