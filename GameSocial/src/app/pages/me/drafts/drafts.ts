import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PostService } from '../../../services/post/post.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { PostModel } from '../../../models/post.model';
import { formatTimeAgo } from '../../../shared/clip-format';
import { extractApiErrorMessage } from '../../../shared/api-error.util';

const TYPE_GLYPH: Record<string, string> = { Clip: '▶', Screenshots: '▣', Review: '★', Poll: '▤', Devlog: '◆' };

/** Account menu "◫ Taslaklar": your unpublished posts — publish (XP is awarded now) or delete. */
@Component({
  selector: 'app-drafts',
  template: `
    <div class="drafts">
      <div class="page-head">
        <div>
          <h1>Taslaklar</h1>
          <p class="page-sub">Only you can see these. Publishing awards the post's XP.</p>
        </div>
      </div>

      @if (isLoading()) {
        <p class="status">Loading...</p>
      } @else if (drafts().length === 0) {
        <p class="status empty">No drafts — "Save draft" in any composer sheet keeps one here.</p>
      } @else {
        <ul class="draft-list">
          @for (draft of drafts(); track draft.id) {
            <li class="draft">
              <span class="draft-glyph" aria-hidden="true">{{ glyph(draft) }}</span>
              <div class="draft-body">
                <div class="draft-title">{{ title(draft) }}</div>
                <div class="draft-meta">{{ draft.postType }}{{ draft.gameName ? ' · ' + draft.gameName : '' }} · saved {{ ago(draft.createdAt) }}</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === draft.id" (click)="remove(draft)">Delete</button>
              <button type="button" class="btn btn-primary btn-sm" [disabled]="busyId() === draft.id" (click)="publish(draft)">Publish</button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './drafts.scss',
})
export class Drafts {
  private postService = inject(PostService);
  private meService = inject(MeService);
  private notificationService = inject(NotificationService);

  protected readonly drafts = signal<PostModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly busyId = signal<string | null>(null);
  protected readonly ago = formatTimeAgo;

  constructor() {
    this.postService
      .getDrafts()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (drafts) => this.drafts.set(drafts),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load drafts.')),
      });
  }

  glyph(post: PostModel): string {
    return TYPE_GLYPH[post.postType] ?? '◫';
  }

  title(post: PostModel): string {
    return post.devlog?.title || post.caption || 'Untitled draft';
  }

  publish(draft: PostModel): void {
    this.busyId.set(draft.id);
    this.postService
      .publishDraft(draft.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.notificationService.success('Published.');
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to publish the draft.')),
      });
  }

  remove(draft: PostModel): void {
    this.busyId.set(draft.id);
    this.postService
      .deleteDraft(draft.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete the draft.')),
      });
  }
}
