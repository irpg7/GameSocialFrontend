import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CommentModel } from '../../../models/comment.model';
import { CommentService } from '../../../services/comment/comment.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { formatTimeAgo } from '../../../shared/clip-format';

/**
 * The "Yorumlar" tab of the Clips page rail (Gamer Feed.dc.html, `onRailComments`).
 *
 * Ported as designed minus three affordances the backend has nothing behind:
 * per-comment votes and the "En yeni / En çok oylanan" sort that depends on
 * them, the "@0:12" timestamp chips (comments carry no clip position), and
 * threaded replies. Deleting your own comment is kept from the existing feed
 * comment UI, since that one is real.
 */
@Component({
  selector: 'app-clip-rail-comments',
  imports: [FormsModule, RouterLink],
  templateUrl: './clip-rail-comments.html',
  styleUrl: './clip-rail-comments.scss',
  host: { class: 'clip-rail-comments' },
})
export class ClipRailComments {
  private commentService = inject(CommentService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  postId = input.required<string>();
  /** Emits +1/-1 so the page can keep the hero's comment counter in step. */
  countChanged = output<number>();

  protected readonly comments = signal<CommentModel[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly draft = signal('');
  protected readonly isSubmitting = signal(false);

  constructor() {
    // Switching the hero clip reloads the thread for the new post.
    effect(() => {
      const postId = this.postId();
      this.comments.set([]);
      this.page.set(1);
      this.hasMore.set(false);
      this.draft.set('');
      this.load(postId, 1);
    });
  }

  protected timeAgo(iso: string): string {
    return formatTimeAgo(iso);
  }

  protected isOwn(comment: CommentModel): boolean {
    return comment.userId === this.authService.currentUser()?.id;
  }

  protected loadMore(): void {
    this.load(this.postId(), this.page() + 1);
  }

  protected submit(): void {
    const body = this.draft().trim();
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
          this.draft.set('');
          this.countChanged.emit(1);
        },
        error: () => this.notificationService.error('Failed to post comment.'),
      });
  }

  protected remove(comment: CommentModel): void {
    this.commentService.delete(this.postId(), comment.id).subscribe({
      next: () => {
        this.comments.update((existing) => existing.filter((c) => c.id !== comment.id));
        this.countChanged.emit(-1);
      },
      error: () => this.notificationService.error('Failed to delete comment.'),
    });
  }

  private load(postId: string, page: number): void {
    this.isLoading.set(true);
    this.commentService
      .list(postId, page)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.comments.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load comments.'),
      });
  }
}
