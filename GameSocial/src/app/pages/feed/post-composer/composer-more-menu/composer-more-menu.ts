import { Component, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PostModel } from '../../../../models/post.model';
import { PostService } from '../../../../services/post/post.service';
import { MeService } from '../../../../services/me/me.service';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';

export type ComposerPick = 'clip' | 'screenshots' | 'review' | 'poll' | 'devlog';

/**
 * The composer's "···" menu: every post type, then your saved drafts with Publish / ✕. Drafts load
 * each time the menu opens (the parent mounts it only while open).
 */
@Component({
  selector: 'app-composer-more-menu',
  templateUrl: './composer-more-menu.html',
  styleUrl: './composer-more-menu.scss',
})
export class ComposerMoreMenu {
  private postService = inject(PostService);
  private meService = inject(MeService);

  isDevlogAllowed = input(false);
  picked = output<ComposerPick>();
  /** A draft was published. */
  posted = output<PostModel>();
  problem = output<string>();
  closed = output<void>();

  protected readonly drafts = signal<PostModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    this.postService
      .getDrafts()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (drafts) => this.drafts.set(drafts),
        error: () => this.loadFailed.set(true),
      });
  }

  protected draftLabel(draft: PostModel): string {
    return draft.devlog?.title || draft.caption || `${draft.postType} draft`;
  }

  protected publish(draft: PostModel): void {
    this.busyId.set(draft.id);
    this.postService
      .publishDraft(draft.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (post) => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.posted.emit(post);
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err: unknown) => this.problem.emit(extractApiErrorMessage(err, 'Could not publish the draft.')),
      });
  }

  protected remove(draft: PostModel): void {
    this.busyId.set(draft.id);
    this.postService
      .deleteDraft(draft.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err: unknown) => this.problem.emit(extractApiErrorMessage(err, 'Could not delete the draft.')),
      });
  }
}
