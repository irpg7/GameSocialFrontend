import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CommentModel, CommentSort } from '../../../models/comment.model';
import { CommentService } from '../../../services/comment/comment.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { formatAgoShortTr, formatClock, formatCount } from '../../../shared/clip-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

interface ReplyThread {
  open: boolean;
  loading: boolean;
  items: CommentModel[];
}

/**
 * The "Yorumlar" tab of the Clips page rail (Gamer Feed.dc.html, `onRailComments`):
 * "En yeni / En çok oylanan" sort, comment cards with LV chip, a clickable
 * "@0:12" stamp that seeks the player, ▲ votes and "Yanıtla", and the composer
 * card that stamps the comment with the player's current frame.
 */
@Component({
  selector: 'app-clip-rail-comments',
  imports: [ImgFallback, FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './clip-rail-comments.html',
  styleUrl: './clip-rail-comments.scss',
  host: { class: 'clip-rail-comments' },
})
export class ClipRailComments {
  private commentService = inject(CommentService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  postId = input.required<string>();
  /** Player position — shown as "@0:12" on the composer and sent as the comment's timestamp. */
  currentTime = input(0);
  /** Emits +1/-1 so the page can keep the hero's comment counter in step. */
  countChanged = output<number>();
  /** A "@0:12" stamp was clicked — the host seeks its player there. */
  seek = output<number>();

  protected readonly comments = signal<CommentModel[]>([]);
  protected readonly sort = signal<CommentSort>('new');
  protected readonly isLoading = signal(false);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly draft = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly replyTo = signal<CommentModel | null>(null);
  protected readonly threads = signal<Record<string, ReplyThread>>({});
  /** Ids of comments posted in this session — the design outlines your own in red. */
  protected readonly ownIds = signal<Set<string>>(new Set());

  protected readonly stampLabel = computed(() => `@${formatClock(this.currentTime())}`);
  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.isSubmitting());

  constructor() {
    // Switching the hero clip (or the sort) reloads the thread.
    effect(() => {
      const postId = this.postId();
      const sort = this.sort();
      untracked(() => {
        this.comments.set([]);
        this.threads.set({});
        this.page.set(1);
        this.hasMore.set(false);
        this.load(postId, 1, sort);
      });
    });
    effect(() => {
      this.postId();
      untracked(() => {
        this.draft.set('');
        this.replyTo.set(null);
      });
    });
  }

  protected setSort(sort: CommentSort): void {
    this.sort.set(sort);
  }

  protected ago(iso: string): string {
    return formatAgoShortTr(iso);
  }

  protected stamp(comment: CommentModel): string | null {
    return comment.timestampSeconds == null ? null : `@${formatClock(comment.timestampSeconds)}`;
  }

  protected count(n: number): string {
    return formatCount(n);
  }

  protected isOwn(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  protected isFresh(comment: CommentModel): boolean {
    return this.ownIds().has(comment.id);
  }

  protected loadMore(): void {
    this.load(this.postId(), this.page() + 1, this.sort());
  }

  protected startReply(comment: CommentModel): void {
    this.replyTo.set(comment);
  }

  protected cancelReply(): void {
    this.replyTo.set(null);
  }

  protected toggleReplies(comment: CommentModel): void {
    const thread = this.threads()[comment.id];
    if (thread?.open) {
      this.patchThread(comment.id, { open: false });
      return;
    }
    this.patchThread(comment.id, { open: true, loading: true, items: thread?.items ?? [] });
    this.commentService.list(this.postId(), 1, 50, { parentCommentId: comment.id, sort: 'oldest' }).subscribe({
      next: (result) => this.patchThread(comment.id, { loading: false, items: result.items }),
      error: () => {
        this.patchThread(comment.id, { loading: false });
        this.notificationService.error('Yanıtlar yüklenemedi.');
      },
    });
  }

  protected toggleVote(comment: CommentModel): void {
    this.commentService.toggleVote(this.postId(), comment.id).subscribe({
      next: (result) => this.patchComment(comment.id, { voteCount: result.voteCount, isVotedByCurrentUser: result.voted }),
      error: () => this.notificationService.error('Oy verilemedi.'),
    });
  }

  protected submit(): void {
    const body = this.draft().trim();
    if (!body || this.isSubmitting()) {
      return;
    }
    const parent = this.replyTo();
    const parentId = parent ? (parent.parentCommentId ?? parent.id) : undefined;
    this.isSubmitting.set(true);
    this.commentService
      .create(this.postId(), body, { timestampSeconds: Math.floor(this.currentTime()), parentCommentId: parentId })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (comment) => {
          this.ownIds.update((ids) => new Set(ids).add(comment.id));
          if (parentId) {
            const thread = this.threads()[parentId];
            this.patchThread(parentId, { open: true, loading: false, items: [...(thread?.items ?? []), comment] });
            this.patchComment(parentId, { replyCount: (this.comments().find((c) => c.id === parentId)?.replyCount ?? 0) + 1 });
          } else {
            // The design's composer switches the list to "En yeni" with your comment on top.
            if (this.sort() !== 'new') {
              this.sort.set('new');
            } else {
              this.comments.update((existing) => [comment, ...existing]);
            }
            this.countChanged.emit(1);
          }
          this.draft.set('');
          this.replyTo.set(null);
        },
        error: () => this.notificationService.error('Yorum gönderilemedi.'),
      });
  }

  protected remove(comment: CommentModel): void {
    this.commentService.delete(this.postId(), comment.id).subscribe({
      next: () => {
        if (comment.parentCommentId) {
          const thread = this.threads()[comment.parentCommentId];
          this.patchThread(comment.parentCommentId, { items: (thread?.items ?? []).filter((c) => c.id !== comment.id) });
          const parent = this.comments().find((c) => c.id === comment.parentCommentId);
          if (parent) {
            this.patchComment(parent.id, { replyCount: Math.max(0, parent.replyCount - 1) });
          }
          return;
        }
        this.comments.update((existing) => existing.filter((c) => c.id !== comment.id));
        this.countChanged.emit(-1);
      },
      error: () => this.notificationService.error('Yorum silinemedi.'),
    });
  }

  protected thread(id: string): ReplyThread | undefined {
    return this.threads()[id];
  }

  private patchThread(id: string, patch: Partial<ReplyThread>): void {
    this.threads.update((threads) => ({
      ...threads,
      [id]: { ...(threads[id] ?? { open: false, loading: false, items: [] }), ...patch },
    }));
  }

  private patchComment(id: string, patch: Partial<CommentModel>): void {
    const apply = (list: CommentModel[]) => list.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.comments.update(apply);
    this.threads.update((threads) =>
      Object.fromEntries(Object.entries(threads).map(([key, thread]) => [key, { ...thread, items: apply(thread.items) }])),
    );
  }

  private load(postId: string, page: number, sort: CommentSort): void {
    this.isLoading.set(true);
    this.commentService
      .list(postId, page, 20, { sort })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          if (postId !== this.postId() || sort !== this.sort()) {
            return;
          }
          this.comments.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: () => this.notificationService.error('Yorumlar yüklenemedi.'),
      });
  }
}
