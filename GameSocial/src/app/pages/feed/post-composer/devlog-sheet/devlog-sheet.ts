import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormField, applyEach, form, maxLength } from '@angular/forms/signals';
import { SelectControl } from '../../../../shared/select-control';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { RichTextToolbar } from '../../../../shared/rich-text/rich-text-toolbar';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { GamePicker, GamePickerFilter } from '../../../../shared/game-picker/game-picker';
import { GameService } from '../../../../services/game/game.service';
import { GameLookup } from '../../../../services/game/game-lookup.service';
import { PatchLineStatus, PostMediaType, PostPhotoType, PostType } from '../../../../models/post-enums.model';
import { AuthService } from '../../../../services/auth/auth.service';
import { MeService } from '../../../../services/me/me.service';
import { DevlogMetaService, DevlogNextSequenceModel } from '../devlog-meta.service';
import {
  ComposerSubmission,
  MAX_BODY_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_VIDEO_BYTES,
  MediaEntry,
  PHOTO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  formatCount,
  idOrNull,
  mediaEntry,
  revokeMedia,
} from '../composer-shared';

/**
 * The "TEST BRANCH ▾" picker — must equal CreatePostCommandValidator.AllowedBranchTags.
 */
export const BRANCH_TAGS = ['TEST BRANCH', 'PUBLIC', 'BETA', 'EXPERIMENTAL'] as const;
type BranchTag = (typeof BRANCH_TAGS)[number];

interface PatchLineEntry {
  text: string;
  status: PatchLineStatus;
}

/** The sheet's typed fields. The composer holds them, so closing and reopening keeps the draft. */
export interface DevlogFields {
  title: string;
  body: string;
  /** '' = not picked. */
  gameId: string;
  buildTag: string;
  branchTag: BranchTag;
  testBranchUrl: string;
  patchLines: PatchLineEntry[];
}

/** The media band: an in-engine clip and a before / after pair. */
export interface DevlogMedia {
  clip: MediaEntry | null;
  before: MediaEntry | null;
  after: MediaEntry | null;
}

export function emptyDevlogFields(): DevlogFields {
  return { title: '', body: '', gameId: '', buildTag: '', branchTag: 'TEST BRANCH', testBranchUrl: '', patchLines: [] };
}

export function emptyDevlogMedia(): DevlogMedia {
  return { clip: null, before: null, after: null };
}

/** Order the patch-line glyph cycles through on click. */
const PATCH_STATUS_CYCLE = [PatchLineStatus.Shipped, PatchLineStatus.Fixed, PatchLineStatus.Investigating];

/**
 * New DevLog sheet (Gamer Feed.dc.html `sheetDevlog`): studio identity card, DEVLOG #n + build and
 * branch tags, headline, rich-text body, patch lines and the media band. Picking a game loads its
 * "DEVLOG #n" preview and follower count. It validates and builds the multipart payload; the
 * composer sends it (`send`).
 *
 * "◷ Open a bug thread" has no bug-tracker entity behind it: it adds an Investigating patch line
 * (the design's own "still investigating, keep the clips coming" line), and the thread itself lives
 * in the post's comments.
 */
@Component({
  selector: 'app-devlog-sheet',
  imports: [FormField, SelectControl, SheetModal, RichTextToolbar, ImgFallback, GamePicker],
  templateUrl: './devlog-sheet.html',
  styleUrl: './devlog-sheet.scss',
})
export class DevlogSheet {
  private injector = inject(Injector);
  private authService = inject(AuthService);
  private meService = inject(MeService);
  private devlogMeta = inject(DevlogMetaService);
  private gameService = inject(GameService);
  private gameLookup = inject(GameLookup);

  isSubmitting = input(false);
  isSavingDraft = input(false);
  errorMessage = input<string | null>(null);
  fields = model.required<DevlogFields>();
  media = model.required<DevlogMedia>();
  closed = output<void>();
  send = output<ComposerSubmission>();

  protected readonly PatchLineStatus = PatchLineStatus;
  protected readonly branchTags = BRANCH_TAGS;

  protected readonly devlogForm = form(this.fields, (path) => {
    maxLength(path.buildTag, MAX_TAG_LENGTH);
    maxLength(path.testBranchUrl, 500);
    maxLength(path.title, MAX_TITLE_LENGTH);
    maxLength(path.body, MAX_BODY_LENGTH);
    applyEach(path.patchLines, (line) => {
      maxLength(line.text, 300);
    });
  });

  private videoInputRef = viewChild<ElementRef<HTMLInputElement>>('devlogVideoInput');
  private photoInputRef = viewChild<ElementRef<HTMLInputElement>>('devlogPhotoInput');
  private patchInputs = viewChildren<ElementRef<HTMLInputElement>>('patchInput');

  private readonly validationError = signal<string | null>(null);
  protected readonly shownError = computed(() => this.validationError() ?? this.errorMessage());

  protected readonly gameId = computed(() => idOrNull(this.fields().gameId));
  protected readonly patchLines = computed(() => this.fields().patchLines);
  protected readonly sequence = signal<DevlogNextSequenceModel | null>(null);
  private readonly followerCount = signal<number | null>(null);

  private readonly isDevlogAllowed = computed(() => this.authService.currentUser()?.isDeveloper ?? false);
  /**
   * DevLogs only go to games this account is the verified developer of (an admin
   * assigns the owner in Backoffice → Games; the server enforces the same rule).
   * The picker asks the server for just those; the count drives the "no game linked" hint.
   */
  protected readonly ownedGamesFilter: GamePickerFilter = { ownedByMe: true };
  protected readonly ownedGameCount = signal<number | null>(null);
  /** Identity card name: the game's studio, else the developer's studio name, else the username. */
  protected readonly studioName = computed(
    () => this.sequence()?.studio || this.meService.me()?.studioName || this.authService.currentUser()?.username || '',
  );
  protected readonly avatarUrl = computed(() => this.meService.me()?.avatarUrl ?? null);
  protected readonly gameName = computed(() => {
    const id = this.gameId();
    return id === null ? null : (this.gameLookup.get(id)?.name ?? this.sequence()?.gameName ?? null);
  });
  protected readonly followerLabel = computed(() => formatCount(this.followerCount() ?? 0));

  constructor() {
    this.gameService.list({ ownedByMe: true, pageSize: 1 }).subscribe({
      next: (page) => this.ownedGameCount.set(page.totalCount),
      // Only decides whether the hint shows; the picker reports its own load errors.
      error: () => void 0,
    });

    // Picking a game loads its "DEVLOG #n" preview and follower count (both only decorate the sheet).
    effect((onCleanup) => {
      const gameId = this.gameId();
      this.sequence.set(null);
      this.followerCount.set(null);
      if (gameId === null) {
        return;
      }
      const seqSub = this.devlogMeta.nextSequence(gameId).subscribe({
        next: (seq) => this.sequence.set(seq),
        error: () => void 0,
      });
      const countSub = this.devlogMeta.followerCount(gameId).subscribe({
        next: (res) => this.followerCount.set(res.followerCount),
        error: () => void 0,
      });
      onCleanup(() => {
        seqSub.unsubscribe();
        countSub.unsubscribe();
      });
    });
  }

  // ─── Media band ───────────────────────────────────────────────────
  protected browseClip(): void {
    this.videoInputRef()?.nativeElement.click();
  }

  protected browseBeforeAfter(): void {
    this.photoInputRef()?.nativeElement.click();
  }

  protected onClipSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0] ?? null;
    inputEl.value = '';
    if (file) {
      this.setMedia('clip', file);
    }
  }

  /** "▣ Before / after": the first picked image is Before, the second After (a single pick fills the empty slot). */
  protected onPhotosSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const files = Array.from(inputEl.files ?? []).slice(0, 2);
    inputEl.value = '';
    if (files.length === 2) {
      this.setMedia('before', files[0]);
      this.setMedia('after', files[1]);
    } else if (files.length === 1) {
      const { before, after } = this.media();
      this.setMedia(before && !after ? 'after' : 'before', files[0]);
    }
  }

  protected removeMedia(slot: keyof DevlogMedia): void {
    revokeMedia(this.media()[slot]);
    this.media.update((m) => ({ ...m, [slot]: null }));
  }

  private setMedia(slot: keyof DevlogMedia, file: File): void {
    revokeMedia(this.media()[slot]);
    this.media.update((m) => ({ ...m, [slot]: mediaEntry(file) }));
  }

  // ─── Patch lines ──────────────────────────────────────────────────
  protected addPatchLine(status: PatchLineStatus = PatchLineStatus.Shipped): void {
    this.fields.update((f) => ({ ...f, patchLines: [...f.patchLines, { text: '', status }] }));
    afterNextRender(() => this.patchInputs().at(-1)?.nativeElement.focus(), { injector: this.injector });
  }

  /** "◷ Open a bug thread" — an Investigating patch line; the thread itself is the post's comments. */
  protected openBugThread(): void {
    this.addPatchLine(PatchLineStatus.Investigating);
  }

  protected cyclePatchStatus(index: number): void {
    this.fields.update((f) => ({
      ...f,
      patchLines: f.patchLines.map((line, i) => {
        if (i !== index) return line;
        const next = PATCH_STATUS_CYCLE[(PATCH_STATUS_CYCLE.indexOf(line.status) + 1) % PATCH_STATUS_CYCLE.length];
        return { ...line, status: next };
      }),
    }));
  }

  protected patchStatusLabel(status: PatchLineStatus): string {
    return status === PatchLineStatus.Shipped ? 'Shipped' : status === PatchLineStatus.Fixed ? 'Fixed' : 'Investigating';
  }

  /** Backspace in an empty line removes it (the design draws no per-line remove button). */
  protected onPatchKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.patchLines()[index]?.text) {
      event.preventDefault();
      this.fields.update((f) => ({ ...f, patchLines: f.patchLines.filter((_, i) => i !== index) }));
      afterNextRender(() => this.patchInputs().at(Math.max(index - 1, 0))?.nativeElement.focus(), {
        injector: this.injector,
      });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.addPatchLine();
    }
  }

  /** The rich-text toolbar rewrites the body (bold / list markup around the selection). */
  protected setBody(body: string): void {
    this.fields.update((f) => ({ ...f, body }));
  }

  // ─── Submit ───────────────────────────────────────────────────────
  protected submit(asDraft: boolean): void {
    const error = this.validate(asDraft);
    this.validationError.set(error);
    if (!error) {
      this.send.emit({ type: PostType.Devlog, asDraft, formData: buildDevlogFormData(this.fields(), this.media(), asDraft) });
    }
  }

  /** A draft may be partial (the server relaxes required fields and re-checks them on publish). */
  private validate(asDraft: boolean): string | null {
    const fields = this.fields();
    if (!this.isDevlogAllowed()) {
      return 'Only developer accounts can publish devlogs.';
    }
    if (this.gameId() === null) {
      return 'Pick the game this DevLog is about.';
    }
    if (asDraft) {
      return null;
    }
    if (this.sequence()?.canPublish === false) {
      return 'Only the game’s developer account can publish DevLogs for it.';
    }
    if (!fields.title.trim()) {
      return 'Headline is required.';
    }
    if (fields.title.length > MAX_TITLE_LENGTH) {
      return `Headline must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    if (!fields.body.trim()) {
      return 'Tell people what changed — the body is required.';
    }
    if (fields.body.length > MAX_BODY_LENGTH) {
      return `Body must be ${MAX_BODY_LENGTH} characters or fewer.`;
    }
    if (fields.buildTag.length > MAX_TAG_LENGTH) {
      return `Build tag must be ${MAX_TAG_LENGTH} characters or fewer.`;
    }
    const url = fields.testBranchUrl.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      return 'Test branch link must start with http:// or https://.';
    }
    const { clip, before, after } = this.media();
    if (clip && (!VIDEO_MIME_TYPES.includes(clip.file.type) || clip.file.size > MAX_VIDEO_BYTES)) {
      return 'In-engine clip must be an mp4, mov or webm video of 100MB or less.';
    }
    for (const photo of [before?.file, after?.file]) {
      if (photo && (!PHOTO_MIME_TYPES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES)) {
        return 'Before / after images must be jpg, png or webp, 5MB or less.';
      }
    }
    return null;
  }
}

function buildDevlogFormData(fields: DevlogFields, media: DevlogMedia, asDraft: boolean): FormData {
  const formData = new FormData();
  formData.append('PostType', String(PostType.Devlog));
  if (asDraft) {
    formData.append('IsDraft', 'true');
  }
  formData.append('Title', fields.title.trim());
  formData.append('Body', fields.body.trim());
  formData.append('GameId', fields.gameId);
  if (fields.buildTag.trim()) {
    formData.append('BuildTag', fields.buildTag.trim().toUpperCase());
  }
  formData.append('BranchTag', fields.branchTag);
  if (fields.testBranchUrl.trim()) {
    formData.append('TestBranchUrl', fields.testBranchUrl.trim());
  }
  const lines = fields.patchLines.filter((line) => line.text.trim().length > 0);
  if (lines.length > 0) {
    const payload = lines.map((line) => ({ text: line.text.trim(), status: PatchLineStatus[line.status] }));
    formData.append('PatchLinesJson', JSON.stringify(payload));
  }
  formData.append('MediaType', String(PostMediaType.Photo));
  const band: [MediaEntry | null, string][] = [
    [media.clip, 'InEngine'],
    [media.before, 'Before'],
    [media.after, 'After'],
  ];
  for (const [entry, role] of band) {
    if (entry) {
      formData.append('Media', entry.file);
      formData.append('MediaRoles', role);
    }
  }
  if (media.before || media.after) {
    formData.append('PhotoType', String(PostPhotoType.Screenshot));
  }
  return formData;
}
