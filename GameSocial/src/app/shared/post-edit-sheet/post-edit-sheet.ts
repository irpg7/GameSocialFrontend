import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormField, applyEach, form, max, maxLength, min } from '@angular/forms/signals';
import { SelectControl } from '../select-control';
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
  imports: [FormField, SelectControl, SheetModal],
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

  // Every editable field in one Signal Forms model, filled from the post in ngOnInit. The length and
  // range rules only drive the native maxlength / min / max (save() still clamps), as before.
  private readonly model = signal({
    caption: '',
    tags: '',
    title: '',
    body: '',
    score: 0,
    playStatus: 'Finished' as PlayStatusName,
    hoursPlayed: 0,
    spoilerFree: false,
    buildTag: '',
    branchTag: '',
    testBranchUrl: '',
    patchLines: [] as PatchLineDraft[],
  });

  protected readonly editForm = form(this.model, (path) => {
    maxLength(path.caption, 500);
    maxLength(path.title, 200);
    maxLength(path.body, 10000);
    min(path.score, 0);
    max(path.score, 10);
    min(path.hoursPlayed, 0);
    maxLength(path.buildTag, 50);
    maxLength(path.testBranchUrl, 500);
    applyEach(path.patchLines, (line) => {
      maxLength(line.text, 200);
    });
  });

  protected readonly patchLineCount = computed(() => this.model().patchLines.length);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const post = this.post();
    this.model.update((m) => {
      const next = { ...m, caption: post.caption ?? '', tags: post.tags.join(', ') };
      if (post.devlog) {
        next.title = post.devlog.title;
        next.body = post.devlog.body;
        next.buildTag = post.devlog.buildTag ?? '';
        next.branchTag = post.devlog.branchTag ?? '';
        next.testBranchUrl = post.devlog.testBranchUrl ?? '';
        next.patchLines = post.devlog.patchLines.map((l) => ({ text: l.text, status: l.status }));
      }
      if (post.review) {
        next.body = post.review.body;
        next.score = post.review.score;
        next.playStatus = post.review.playStatus;
        next.hoursPlayed = post.review.hoursPlayed;
        next.spoilerFree = post.review.spoilerFree;
      }
      return next;
    });
  }

  protected addPatchLine(): void {
    this.model.update((m) =>
      m.patchLines.length < MAX_PATCH_LINES ? { ...m, patchLines: [...m.patchLines, { text: '', status: 'Shipped' }] } : m,
    );
  }

  protected removePatchLine(index: number): void {
    this.model.update((m) => ({ ...m, patchLines: m.patchLines.filter((_, i) => i !== index) }));
  }

  protected save(): void {
    if (this.isSaving()) {
      return;
    }
    const type = this.type();
    const draft = this.model();
    const body: UpdatePostBody = {
      caption: draft.caption,
      tags: draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    if (type === 'Devlog') {
      body.title = draft.title;
      body.body = draft.body;
      body.buildTag = draft.buildTag;
      body.branchTag = draft.branchTag;
      body.testBranchUrl = draft.testBranchUrl;
      body.patchLines = draft.patchLines.filter((l) => l.text.trim().length > 0);
    }
    if (type === 'Review') {
      body.body = draft.body;
      body.score = Math.round(Math.min(10, Math.max(0, draft.score)) * 10) / 10;
      body.playStatus = draft.playStatus;
      body.hoursPlayed = Math.max(0, Math.floor(draft.hoursPlayed));
      body.spoilerFree = draft.spoilerFree;
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
