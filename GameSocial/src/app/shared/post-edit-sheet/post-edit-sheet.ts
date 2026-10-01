import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { PatchLineStatusName, PlayStatusName, PostModel } from '../../models/post.model';
import { PostService, UpdatePostBody } from '../../services/post/post.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SheetModal } from '../sheet-modal/sheet-modal';
import { extractApiErrorMessage } from '../api-error.util';

const BRANCH_TAGS = ['TEST BRANCH', 'PUBLIC', 'BETA', 'EXPERIMENTAL'] as const;
const PLAY_STATUSES: { key: PlayStatusName; label: string }[] = [
  { key: 'Finished', label: 'Finished' },
  { key: 'StillPlaying', label: 'Still playing' },
  { key: 'Dropped', label: 'Dropped' },
];
const PATCH_STATUSES: PatchLineStatusName[] = ['Shipped', 'Fixed', 'Investigating'];
const MAX_PATCH_LINES = 20;

interface PatchLineDraft {
  text: string;
  status: PatchLineStatusName;
}

/**
 * "✎ Edit post" — only the author opens it (the ··· menu checks ownership, the
 * server enforces it). Media, game, squad and type stay fixed: changing the game
 * would break review averages and devlog numbering. Poll options are locked once
 * people can vote, so a poll only edits its question.
 */
@Component({
  selector: 'app-post-edit-sheet',
  imports: [FormsModule, SheetModal],
  templateUrl: './post-edit-sheet.html',
  styleUrl: './post-edit-sheet.scss',
})
export class PostEditSheet implements OnInit {
  private postService = inject(PostService);
  private notificationService = inject(NotificationService);

  readonly post = input.required<PostModel>();
  readonly saved = output<PostModel>();
  readonly closed = output<void>();

  protected readonly branchTags = BRANCH_TAGS;
  protected readonly playStatuses = PLAY_STATUSES;
  protected readonly patchStatuses = PATCH_STATUSES;
  protected readonly maxPatchLines = MAX_PATCH_LINES;

  protected readonly type = computed(() => this.post().postType);
  protected readonly captionLabel = computed(() =>
    this.type() === 'Review' ? 'Headline' : this.type() === 'Poll' ? 'Question' : 'Caption',
  );

  protected readonly caption = signal('');
  protected readonly tags = signal('');
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly score = signal(0);
  protected readonly playStatus = signal<PlayStatusName>('Finished');
  protected readonly hoursPlayed = signal(0);
  protected readonly spoilerFree = signal(false);
  protected readonly buildTag = signal('');
  protected readonly branchTag = signal('');
  protected readonly testBranchUrl = signal('');
  protected readonly patchLines = signal<PatchLineDraft[]>([]);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const post = this.post();
    this.caption.set(post.caption ?? '');
    this.tags.set(post.tags.join(', '));
    if (post.devlog) {
      this.title.set(post.devlog.title);
      this.body.set(post.devlog.body);
      this.buildTag.set(post.devlog.buildTag ?? '');
      this.branchTag.set(post.devlog.branchTag ?? '');
      this.testBranchUrl.set(post.devlog.testBranchUrl ?? '');
      this.patchLines.set(post.devlog.patchLines.map((l) => ({ text: l.text, status: l.status })));
    }
    if (post.review) {
      this.body.set(post.review.body);
      this.score.set(post.review.score);
      this.playStatus.set(post.review.playStatus);
      this.hoursPlayed.set(post.review.hoursPlayed);
      this.spoilerFree.set(post.review.spoilerFree);
    }
  }

  protected updatePatchLine(index: number, patch: Partial<PatchLineDraft>): void {
    this.patchLines.update((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  protected addPatchLine(): void {
    this.patchLines.update((lines) => (lines.length < MAX_PATCH_LINES ? [...lines, { text: '', status: 'Shipped' }] : lines));
  }

  protected removePatchLine(index: number): void {
    this.patchLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  protected save(): void {
    if (this.isSaving()) {
      return;
    }
    const type = this.type();
    const body: UpdatePostBody = {
      caption: this.caption(),
      tags: this.tags()
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    if (type === 'Devlog') {
      body.title = this.title();
      body.body = this.body();
      body.buildTag = this.buildTag();
      body.branchTag = this.branchTag();
      body.testBranchUrl = this.testBranchUrl();
      body.patchLines = this.patchLines().filter((l) => l.text.trim().length > 0);
    }
    if (type === 'Review') {
      body.body = this.body();
      body.score = Math.round(Math.min(10, Math.max(0, this.score())) * 10) / 10;
      body.playStatus = this.playStatus();
      body.hoursPlayed = Math.max(0, Math.floor(this.hoursPlayed()));
      body.spoilerFree = this.spoilerFree();
    }

    this.errorMessage.set(null);
    this.isSaving.set(true);
    this.postService
      .update(this.post().id, body)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => {
          this.notificationService.success('Post updated.');
          this.saved.emit(updated);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to update the post.')),
      });
  }
}
