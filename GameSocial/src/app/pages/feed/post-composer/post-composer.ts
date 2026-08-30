import { Component, ElementRef, OnDestroy, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameModel } from '../../../models/game.model';
import { PostModel } from '../../../models/post.model';
import { PatchLineStatus, PostMediaType, PostPhotoType, PostType } from '../../../models/post-enums.model';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { SquadService } from '../../../services/squad/squad.service';
import { SquadModel } from '../../../models/squad.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { ReviewSheet } from '../../../shared/review-sheet/review-sheet';

const MAX_CAPTION_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;
const MAX_TAG_LENGTH = 50;
const MAX_POLL_OPTION_LENGTH = 120;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;
const MAX_SCREENSHOTS = 10;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ScreenshotEntry {
  file: File;
  previewUrl: string;
}

interface PatchLineEntry {
  text: string;
  status: PatchLineStatus;
}

type PollDuration = '24h' | '3d' | '1w';
type ComposerTab = 'clip' | 'screenshots';
type ComposerSheet = 'poll' | 'devlog' | null;

/**
 * Post-type picker + composer. Clip and Screenshots expand an inline panel
 * right in this bar; Poll and Devlog open a `SheetModal` right here, while
 * Review opens the standalone `ReviewSheet` component (factored out in
 * Phase 3 so the Reviews page can open the exact same form) — per the
 * spec's own composer=inline / sheet=modal split. All 5 types still submit
 * through the same FormData-based PostService.createPost — see
 * buildFormData() for the exact field mapping per type, confirmed against
 * CreatePostCommandValidator.cs directly.
 */
@Component({
  selector: 'app-post-composer',
  imports: [FormsModule, SheetModal, ReviewSheet],
  templateUrl: './post-composer.html',
  styleUrl: './post-composer.scss',
})
export class PostComposer implements OnInit, OnDestroy {
  private postService = inject(PostService);
  private squadService = inject(SquadService);
  protected readonly authService = inject(AuthService);

  games = input.required<GameModel[]>();
  posted = output<PostModel>();

  protected readonly PostPhotoType = PostPhotoType;
  protected readonly PatchLineStatus = PatchLineStatus;

  protected readonly maxCaptionLength = MAX_CAPTION_LENGTH;
  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly maxBodyLength = MAX_BODY_LENGTH;
  protected readonly maxTagLength = MAX_TAG_LENGTH;
  protected readonly maxPollOptionLength = MAX_POLL_OPTION_LENGTH;
  protected readonly minPollOptions = MIN_POLL_OPTIONS;
  protected readonly maxPollOptions = MAX_POLL_OPTIONS;
  protected readonly maxScreenshots = MAX_SCREENSHOTS;

  protected readonly isDevlogAllowed = computed(() => this.authService.currentUser()?.isDeveloper ?? false);

  /**
   * The chip row drives three independent pieces of UI, kept as separate
   * signals so a modal opening never bleeds into the Clip/Screenshots chip
   * highlighting (the bug this replaced: opening Review/Poll/Devlog used to
   * force the underlying `postType` back to Clip, which made the Clip chip
   * light up *alongside* whichever sheet was actually open).
   */
  protected readonly selectedTab = signal<ComposerTab>('clip');
  protected readonly openSheet = signal<ComposerSheet>(null);
  /** Review isn't driven by `openSheet` — it's the standalone ReviewSheet, opened/closed independently. */
  protected readonly isReviewSheetOpen = signal(false);

  /** The post type the inline Post button / open sheet is currently about to submit. */
  protected readonly activePostType = computed<PostType>(() => {
    const sheet = this.openSheet();
    if (sheet === 'poll') return PostType.Poll;
    if (sheet === 'devlog') return PostType.Devlog;
    return this.selectedTab() === 'screenshots' ? PostType.Screenshots : PostType.Clip;
  });

  /** Populates the optional squad-tag select for Clip/Screenshots — only squads the user is a member of (required server-side). */
  protected readonly mySquads = signal<SquadModel[]>([]);

  // ─── Clip / Screenshots (shared inline panel fields) ─────────
  protected readonly gameId = signal<number | null>(null);
  protected readonly caption = signal('');
  protected readonly squadId = signal<number | null>(null);
  protected readonly photoType = signal<PostPhotoType>(PostPhotoType.Screenshot);

  // ─── Clip ──────────────────────────────────────────────────────
  private fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly isDraggingClip = signal(false);

  // ─── Screenshots ───────────────────────────────────────────────
  private screenshotsInputRef = viewChild<ElementRef<HTMLInputElement>>('screenshotsInput');
  protected readonly screenshotFiles = signal<ScreenshotEntry[]>([]);
  protected readonly isDraggingScreenshots = signal(false);

  // ─── Devlog sheet ──────────────────────────────────────────────
  private devlogFileInputRef = viewChild<ElementRef<HTMLInputElement>>('devlogFileInput');
  protected readonly devlogTitle = signal('');
  protected readonly devlogBody = signal('');
  protected readonly devlogGameId = signal<number | null>(null);
  protected readonly buildTag = signal('');
  protected readonly branchTag = signal('');
  protected readonly devlogFile = signal<File | null>(null);
  protected readonly devlogPreviewUrl = signal<string | null>(null);
  protected readonly patchLines = signal<PatchLineEntry[]>([]);

  // ─── Poll sheet ────────────────────────────────────────────────
  protected readonly pollQuestion = signal('');
  protected readonly pollOptions = signal<string[]>(['', '']);
  protected readonly pollDuration = signal<PollDuration>('24h');
  protected readonly pollGameId = signal<number | null>(null);
  protected readonly pollHideResults = signal(false);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  ngOnDestroy(): void {
    this.revoke(this.previewUrl());
    this.revoke(this.devlogPreviewUrl());
    for (const entry of this.screenshotFiles()) {
      this.revoke(entry.previewUrl);
    }
  }

  selectTab(tab: ComposerTab): void {
    this.openSheet.set(null);
    this.isReviewSheetOpen.set(false);
    this.selectedTab.set(tab);
    this.errorMessage.set(null);
  }

  openSheetFor(sheet: 'poll' | 'devlog'): void {
    if (sheet === 'devlog' && !this.isDevlogAllowed()) {
      return;
    }
    this.isReviewSheetOpen.set(false);
    this.openSheet.set(sheet);
    this.errorMessage.set(null);
  }

  closeSheet(): void {
    this.openSheet.set(null);
  }

  openReviewSheet(): void {
    this.openSheet.set(null);
    this.isReviewSheetOpen.set(true);
    this.errorMessage.set(null);
  }

  onReviewPosted(post: PostModel): void {
    this.posted.emit(post);
    this.isReviewSheetOpen.set(false);
  }

  // ─── Clip file handling ────────────────────────────────────────
  triggerClipBrowse(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] ?? null);
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.setFile(null);
  }

  onDragOverClip(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingClip.set(true);
  }

  onDragLeaveClip(): void {
    this.isDraggingClip.set(false);
  }

  onDropClip(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingClip.set(false);
    this.setFile(event.dataTransfer?.files?.[0] ?? null);
  }

  // ─── Screenshots file handling ─────────────────────────────────
  triggerScreenshotBrowse(): void {
    this.screenshotsInputRef()?.nativeElement.click();
  }

  onScreenshotFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    this.addScreenshotFiles(picked);
  }

  onDragOverScreenshots(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingScreenshots.set(true);
  }

  onDragLeaveScreenshots(): void {
    this.isDraggingScreenshots.set(false);
  }

  onDropScreenshots(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingScreenshots.set(false);
    this.addScreenshotFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private addScreenshotFiles(picked: File[]): void {
    if (picked.length === 0) {
      return;
    }
    const room = MAX_SCREENSHOTS - this.screenshotFiles().length;
    const accepted = picked.slice(0, Math.max(room, 0));
    const newEntries = accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    this.screenshotFiles.update((existing) => [...existing, ...newEntries]);
    if (picked.length > accepted.length) {
      this.errorMessage.set(`Only up to ${MAX_SCREENSHOTS} photos are allowed — extra files were skipped.`);
    }
  }

  removeScreenshot(index: number): void {
    const entries = this.screenshotFiles();
    const removed = entries[index];
    if (removed) {
      this.revoke(removed.previewUrl);
    }
    this.screenshotFiles.set(entries.filter((_, i) => i !== index));
  }

  // ─── Devlog file handling ───────────────────────────────────────
  onDevlogFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setDevlogFile(input.files?.[0] ?? null);
  }

  clearDevlogFile(): void {
    this.setDevlogFile(null);
  }

  // ─── Devlog patch lines ─────────────────────────────────────────
  addPatchLine(): void {
    this.patchLines.update((lines) => [...lines, { text: '', status: PatchLineStatus.Shipped }]);
  }

  removePatchLine(index: number): void {
    this.patchLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updatePatchLineText(index: number, text: string): void {
    this.patchLines.update((lines) => lines.map((line, i) => (i === index ? { ...line, text } : line)));
  }

  updatePatchLineStatus(index: number, status: PatchLineStatus): void {
    this.patchLines.update((lines) => lines.map((line, i) => (i === index ? { ...line, status } : line)));
  }

  // ─── Poll options ────────────────────────────────────────────────
  addPollOption(): void {
    if (this.pollOptions().length < MAX_POLL_OPTIONS) {
      this.pollOptions.update((options) => [...options, '']);
    }
  }

  removePollOption(index: number): void {
    if (this.pollOptions().length > MIN_POLL_OPTIONS) {
      this.pollOptions.update((options) => options.filter((_, i) => i !== index));
    }
  }

  updatePollOption(index: number, value: string): void {
    this.pollOptions.update((options) => options.map((option, i) => (i === index ? value : option)));
  }

  submit(): void {
    this.errorMessage.set(null);
    const validationError = this.validate();
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    const submittedType = this.activePostType();
    this.isSubmitting.set(true);
    this.postService
      .createPost(this.buildFormData())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (post) => {
          this.posted.emit(post);
          this.resetTypeForm(submittedType);
          this.openSheet.set(null);
          this.selectedTab.set('clip');
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to publish post. Please try again.')),
      });
  }

  private validate(): string | null {
    switch (this.activePostType()) {
      case PostType.Clip:
        return this.validateClip();
      case PostType.Screenshots:
        return this.validateScreenshots();
      case PostType.Devlog:
        return this.validateDevlog();
      case PostType.Poll:
        return this.validatePoll();
      default:
        // Review is handled entirely by the standalone ReviewSheet, never via this signal.
        return null;
    }
  }

  private validateClip(): string | null {
    if (this.gameId() === null) {
      return 'Please select a game.';
    }
    const file = this.selectedFile();
    if (!file) {
      return 'Please attach a video.';
    }
    if (this.caption().length > MAX_CAPTION_LENGTH) {
      return `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
    }
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      return 'Unsupported video format. Use mp4, mov or webm.';
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return 'Video must be 100MB or smaller.';
    }
    return null;
  }

  private validateScreenshots(): string | null {
    if (this.gameId() === null) {
      return 'Please select a game.';
    }
    const files = this.screenshotFiles();
    if (files.length < 1 || files.length > MAX_SCREENSHOTS) {
      return `Please attach 1 to ${MAX_SCREENSHOTS} photos.`;
    }
    if (this.caption().length > MAX_CAPTION_LENGTH) {
      return `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
    }
    for (const entry of files) {
      if (!PHOTO_MIME_TYPES.includes(entry.file.type)) {
        return 'Unsupported image format. Use jpg, png or webp.';
      }
      if (entry.file.size > MAX_PHOTO_BYTES) {
        return 'Each image must be 5MB or smaller.';
      }
    }
    return null;
  }

  private validateDevlog(): string | null {
    if (!this.isDevlogAllowed()) {
      return 'Only developer accounts can publish devlogs.';
    }
    if (!this.devlogTitle().trim()) {
      return 'Title is required.';
    }
    if (this.devlogTitle().length > MAX_TITLE_LENGTH) {
      return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    if (!this.devlogBody().trim()) {
      return 'Body is required.';
    }
    if (this.devlogBody().length > MAX_BODY_LENGTH) {
      return `Body must be ${MAX_BODY_LENGTH} characters or fewer.`;
    }
    if (this.buildTag().length > MAX_TAG_LENGTH) {
      return `Build tag must be ${MAX_TAG_LENGTH} characters or fewer.`;
    }
    if (this.branchTag().length > MAX_TAG_LENGTH) {
      return `Branch tag must be ${MAX_TAG_LENGTH} characters or fewer.`;
    }
    const file = this.devlogFile();
    if (file) {
      if (!PHOTO_MIME_TYPES.includes(file.type)) {
        return 'Devlog media must be an image (jpg, png or webp).';
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return 'Image must be 5MB or smaller.';
      }
    }
    return null;
  }

  private validatePoll(): string | null {
    if (!this.pollQuestion().trim()) {
      return 'Question is required.';
    }
    if (this.pollQuestion().length > MAX_TITLE_LENGTH) {
      return `Question must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    const options = this.pollOptions()
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
      return `Please provide ${MIN_POLL_OPTIONS}-${MAX_POLL_OPTIONS} options.`;
    }
    if (options.some((option) => option.length > MAX_POLL_OPTION_LENGTH)) {
      return `Each option must be ${MAX_POLL_OPTION_LENGTH} characters or fewer.`;
    }
    return null;
  }

  private buildFormData(): FormData {
    const type = this.activePostType();
    const formData = new FormData();
    formData.append('PostType', String(type));

    switch (type) {
      case PostType.Clip: {
        formData.append('GameId', String(this.gameId()));
        if (this.caption().trim()) {
          formData.append('Caption', this.caption().trim());
        }
        if (this.squadId() !== null) {
          formData.append('SquadId', String(this.squadId()));
        }
        formData.append('MediaType', String(PostMediaType.Video));
        formData.append('Media', this.selectedFile()!);
        break;
      }
      case PostType.Screenshots: {
        formData.append('GameId', String(this.gameId()));
        if (this.caption().trim()) {
          formData.append('Caption', this.caption().trim());
        }
        if (this.squadId() !== null) {
          formData.append('SquadId', String(this.squadId()));
        }
        formData.append('MediaType', String(PostMediaType.Photo));
        formData.append('PhotoType', String(this.photoType()));
        for (const entry of this.screenshotFiles()) {
          formData.append('Media', entry.file);
        }
        break;
      }
      case PostType.Devlog: {
        formData.append('Title', this.devlogTitle().trim());
        formData.append('Body', this.devlogBody().trim());
        if (this.devlogGameId() !== null) {
          formData.append('GameId', String(this.devlogGameId()));
        }
        if (this.buildTag().trim()) {
          formData.append('BuildTag', this.buildTag().trim());
        }
        if (this.branchTag().trim()) {
          formData.append('BranchTag', this.branchTag().trim());
        }
        const lines = this.patchLines().filter((line) => line.text.trim().length > 0);
        if (lines.length > 0) {
          const payload = lines.map((line) => ({ text: line.text.trim(), status: PatchLineStatus[line.status] }));
          formData.append('PatchLinesJson', JSON.stringify(payload));
        }
        formData.append('MediaType', String(PostMediaType.Photo));
        const file = this.devlogFile();
        if (file) {
          formData.append('PhotoType', String(this.photoType()));
          formData.append('Media', file);
        }
        break;
      }
      case PostType.Poll: {
        // Fixed server-side: Poll has no Title/Body in its contract either —
        // Caption is the one required "question" field.
        formData.append('Caption', this.pollQuestion().trim());
        for (const option of this.pollOptions()) {
          if (option.trim()) {
            formData.append('PollOptions', option.trim());
          }
        }
        formData.append('ExpiresAt', this.computeExpiresAt().toISOString());
        formData.append('HideResultsUntilVoted', String(this.pollHideResults()));
        if (this.pollGameId() !== null) {
          formData.append('GameId', String(this.pollGameId()));
        }
        formData.append('MediaType', String(PostMediaType.Photo));
        break;
      }
    }

    return formData;
  }

  private computeExpiresAt(): Date {
    const hours = this.pollDuration() === '24h' ? 24 : this.pollDuration() === '3d' ? 72 : 24 * 7;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private resetTypeForm(type: PostType): void {
    switch (type) {
      case PostType.Clip:
        this.gameId.set(null);
        this.caption.set('');
        this.squadId.set(null);
        this.setFile(null);
        break;
      case PostType.Screenshots:
        this.gameId.set(null);
        this.caption.set('');
        this.squadId.set(null);
        this.photoType.set(PostPhotoType.Screenshot);
        for (const entry of this.screenshotFiles()) {
          this.revoke(entry.previewUrl);
        }
        this.screenshotFiles.set([]);
        break;
      case PostType.Devlog:
        this.devlogTitle.set('');
        this.devlogBody.set('');
        this.devlogGameId.set(null);
        this.buildTag.set('');
        this.branchTag.set('');
        this.patchLines.set([]);
        this.setDevlogFile(null);
        break;
      case PostType.Poll:
        this.pollQuestion.set('');
        this.pollOptions.set(['', '']);
        this.pollDuration.set('24h');
        this.pollGameId.set(null);
        this.pollHideResults.set(false);
        break;
    }
  }

  private setFile(file: File | null): void {
    this.revoke(this.previewUrl());
    this.selectedFile.set(file);
    this.previewUrl.set(file ? URL.createObjectURL(file) : null);
    if (!file) {
      const inputEl = this.fileInputRef();
      if (inputEl) {
        inputEl.nativeElement.value = '';
      }
    }
  }

  private setDevlogFile(file: File | null): void {
    this.revoke(this.devlogPreviewUrl());
    this.devlogFile.set(file);
    this.devlogPreviewUrl.set(file ? URL.createObjectURL(file) : null);
    if (!file) {
      const inputEl = this.devlogFileInputRef();
      if (inputEl) {
        inputEl.nativeElement.value = '';
      }
    }
  }

  private revoke(url: string | null): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
