import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
  viewChildren,
  WritableSignal,
} from '@angular/core';
import { FormField, applyEach, form, maxLength } from '@angular/forms/signals';
import { SelectControl } from '../../../shared/select-control';
import { finalize } from 'rxjs';
import { GameModel } from '../../../models/game.model';
import { PostModel } from '../../../models/post.model';
import { PatchLineStatus, PostMediaType, PostPhotoType, PostType } from '../../../models/post-enums.model';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { MeService } from '../../../services/me/me.service';
import { SquadService } from '../../../services/squad/squad.service';
import { XpAwardsService } from '../../../services/config/xp-awards.service';
import { SquadModel } from '../../../models/squad.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { ReviewSheet } from '../../../shared/review-sheet/review-sheet';
import { RichTextToolbar } from '../../../shared/rich-text/rich-text-toolbar';
import { DevlogMetaService, DevlogNextSequenceModel } from './devlog-meta.service';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

const MAX_CAPTION_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;
const MAX_TAG_LENGTH = 50;
const MAX_POLL_OPTION_LENGTH = 120;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;
const MAX_SCREENSHOTS = 10;
const MAX_POST_TAGS = 8;
const MAX_POST_TAG_LENGTH = 30;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The "TEST BRANCH ▾" picker — must equal CreatePostCommandValidator.AllowedBranchTags.
 */
export const BRANCH_TAGS = ['TEST BRANCH', 'PUBLIC', 'BETA', 'EXPERIMENTAL'] as const;
type BranchTag = (typeof BRANCH_TAGS)[number];

/** Screenshots panel preset tag chips (design: "Photo mode", "No spoilers", "＋ tag"). */
const PRESET_SCREENSHOT_TAGS = ['Photo mode', 'No spoilers'];

/** Poll "Open for" chips — the server only accepts these three durations. */
const POLL_DURATIONS = [
  { key: '24h', label: '24 hours', hours: 24 },
  { key: '3d', label: '3 days', hours: 72 },
  { key: '1w', label: '1 week', hours: 168 },
] as const;
type PollDuration = (typeof POLL_DURATIONS)[number]['key'];

interface ScreenshotEntry {
  file: File;
  previewUrl: string;
}

interface PatchLineEntry {
  text: string;
  status: PatchLineStatus;
}

/** Signal Forms model of the composer (no nulls: '' means "not picked" for the selects). */
interface ComposerModel {
  caption: string;
  gameId: string;
  squadId: string;
  newTag: string;
  devlogTitle: string;
  devlogBody: string;
  devlogGameId: string;
  buildTag: string;
  branchTag: BranchTag;
  testBranchUrl: string;
  patchLines: PatchLineEntry[];
  pollQuestion: string;
  pollOptions: string[];
  pollGameId: string;
}

function emptyComposerModel(): ComposerModel {
  return {
    caption: '',
    gameId: '',
    squadId: '',
    newTag: '',
    devlogTitle: '',
    devlogBody: '',
    devlogGameId: '',
    buildTag: '',
    branchTag: 'TEST BRANCH',
    testBranchUrl: '',
    patchLines: [],
    pollQuestion: '',
    pollOptions: ['', ''],
    pollGameId: '',
  };
}

/** A game select's value ('' = none) as the numeric id the API wants. */
function idOrNull(value: string): number | null {
  return value === '' ? null : Number(value);
}

interface DevlogMediaEntry {
  file: File;
  previewUrl: string;
}

type ComposerTab = 'clip' | 'screenshots';
type ComposerSheet = 'poll' | 'devlog' | null;

/** Order the patch-line glyph cycles through on click. */
const PATCH_STATUS_CYCLE = [PatchLineStatus.Shipped, PatchLineStatus.Fixed, PatchLineStatus.Investigating];

/**
 * Post-type picker + composer (Gamer Feed.dc.html composer bar + sheetPoll /
 * sheetDevlog). Clip and Screenshots expand an inline panel in this bar; Poll
 * and DevLog open a `SheetModal`; Review opens the standalone `ReviewSheet`.
 * "···" opens the more-post-types menu, which also lists saved drafts.
 *
 * Every type submits through PostService.createPost (multipart) — see
 * buildFormData() for the field mapping, confirmed against
 * CreatePostCommandValidator.cs. "Save draft" sends the same payload with
 * IsDraft=true; drafts are published/deleted from the "···" menu.
 *
 * "◷ Open a bug thread" has no bug-tracker entity behind it: it adds an
 * Investigating patch line (the design's own "still investigating, keep the
 * clips coming" line), and the thread itself lives in the post's comments.
 */
@Component({
  selector: 'app-post-composer',
  imports: [ImgFallback, FormField, SelectControl, SheetModal, ReviewSheet, RichTextToolbar],
  templateUrl: './post-composer.html',
  styleUrls: ['./post-composer.scss', './post-composer.mobile.scss'],
})
export class PostComposer implements OnInit, OnDestroy {
  private postService = inject(PostService);
  private squadService = inject(SquadService);
  private meService = inject(MeService);
  private devlogMeta = inject(DevlogMetaService);
  private injector = inject(Injector);
  protected readonly authService = inject(AuthService);
  protected readonly xpAwards = inject(XpAwardsService);

  games = input.required<GameModel[]>();
  posted = output<PostModel>();

  /**
   * When set, the composer posts to this squad and the squad picker is
   * replaced by a locked chip. Used by the squad room.
   */
  preselectedSquadId = input<string | null>(null);
  /** Label for the locked squad chip (the squad list is not fetched twice). */
  lockedSquadName = input<string | undefined>(undefined);
  /** Opens the composer straight on the clip or screenshots tab. */
  initialTab = input<ComposerTab | null>(null);

  protected readonly PatchLineStatus = PatchLineStatus;
  protected readonly branchTags = BRANCH_TAGS;
  protected readonly pollDurations = POLL_DURATIONS;
  protected readonly presetScreenshotTags = PRESET_SCREENSHOT_TAGS;

  // Field length limits live in the form schema (`composerForm`); the ghost "Add an option" input isn't a
  // form field, so it still reads this one directly.
  protected readonly maxPollOptionLength = MAX_POLL_OPTION_LENGTH;
  protected readonly maxPollOptions = MAX_POLL_OPTIONS;
  protected readonly maxScreenshots = MAX_SCREENSHOTS;

  protected readonly isDevlogAllowed = computed(() => this.authService.currentUser()?.isDeveloper ?? false);

  protected readonly selectedTab = linkedSignal<ComposerTab | null>(() => this.initialTab());
  protected readonly openSheet = signal<ComposerSheet>(null);
  protected readonly isReviewSheetOpen = signal(false);
  protected readonly isMoreMenuOpen = signal(false);

  protected readonly composerHint = computed(() => {
    if (this.isReviewSheetOpen()) {
      return 'Review — score it, then say why';
    }
    switch (this.openSheet()) {
      case 'poll':
        return 'Poll — ask the feed something';
      case 'devlog':
        return 'DevLog — build tag, headline, patch lines';
      default:
        switch (this.selectedTab()) {
          case 'screenshots':
            return `Screenshot dump — up to ${MAX_SCREENSHOTS} images`;
          case 'clip':
            return 'New clip — drop the file and name it';
          default:
            return 'Drag a clip in — or pick a type';
        }
    }
  });

  protected readonly activePostType = computed<PostType | null>(() => {
    const sheet = this.openSheet();
    if (sheet === 'poll') return PostType.Poll;
    if (sheet === 'devlog') return PostType.Devlog;
    const tab = this.selectedTab();
    if (tab === 'screenshots') return PostType.Screenshots;
    return tab === 'clip' ? PostType.Clip : null;
  });

  protected readonly mySquads = signal<SquadModel[]>([]);

  /** Real XP for a clip ("Posting a clip is worth +120 XP") — from GET config/xp-awards. */
  protected readonly clipXp = computed(() => this.xpAwards.amount('clip'));

  // ─── Form model (Signal Forms) ─────────────────────────────────
  // Every typed / picked field of the four flows. Selects hold strings ('' = none) and are read back
  // as ids below. The length rules only drive the native maxlength (the submit checks below still
  // produce the messages), and squadId follows the locked squad like the old linkedSignal did.
  private readonly model = linkedSignal<string | null, ComposerModel>({
    source: () => this.preselectedSquadId(),
    computation: (preselected, previous) => ({ ...(previous?.value ?? emptyComposerModel()), squadId: preselected ?? '' }),
  });

  protected readonly composerForm = form(this.model, (path) => {
    maxLength(path.caption, MAX_CAPTION_LENGTH);
    maxLength(path.newTag, MAX_POST_TAG_LENGTH);
    maxLength(path.buildTag, MAX_TAG_LENGTH);
    maxLength(path.testBranchUrl, 500);
    maxLength(path.devlogTitle, MAX_TITLE_LENGTH);
    maxLength(path.devlogBody, MAX_BODY_LENGTH);
    applyEach(path.patchLines, (line) => {
      maxLength(line.text, 300);
    });
    maxLength(path.pollQuestion, MAX_CAPTION_LENGTH);
    applyEach(path.pollOptions, (option) => {
      maxLength(option, MAX_POLL_OPTION_LENGTH);
    });
  });

  private patchModel(patch: Partial<ComposerModel>): void {
    this.model.update((m) => ({ ...m, ...patch }));
  }

  // ─── Clip / Screenshots (shared inline panel fields) ─────────
  protected readonly gameId = computed(() => idOrNull(this.model().gameId));
  protected readonly caption = computed(() => this.model().caption);
  protected readonly squadId = computed(() => this.model().squadId || null);

  // ─── Clip ──────────────────────────────────────────────────────
  private fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly isDraggingClip = signal(false);

  // ─── Screenshots ───────────────────────────────────────────────
  private screenshotsInputRef = viewChild<ElementRef<HTMLInputElement>>('screenshotsInput');
  private tagInputRef = viewChild<ElementRef<HTMLInputElement>>('tagInput');
  protected readonly screenshotFiles = signal<ScreenshotEntry[]>([]);
  protected readonly isDraggingScreenshots = signal(false);
  protected readonly screenshotTags = signal<string[]>([]);
  protected readonly isAddingTag = signal(false);
  protected readonly newTag = computed(() => this.model().newTag);
  /** Custom tags (everything that isn't one of the preset chips), rendered after them. */
  protected readonly customScreenshotTags = computed(() =>
    this.screenshotTags().filter((t) => !PRESET_SCREENSHOT_TAGS.includes(t)),
  );

  // ─── Devlog sheet ──────────────────────────────────────────────
  private devlogVideoInputRef = viewChild<ElementRef<HTMLInputElement>>('devlogVideoInput');
  private devlogPhotoInputRef = viewChild<ElementRef<HTMLInputElement>>('devlogPhotoInput');
  private patchInputs = viewChildren<ElementRef<HTMLInputElement>>('patchInput');
  protected readonly devlogTitle = computed(() => this.model().devlogTitle);
  protected readonly devlogBody = computed(() => this.model().devlogBody);
  protected readonly devlogGameId = computed(() => idOrNull(this.model().devlogGameId));
  /**
   * DevLogs only go to games this account is the verified developer of (an admin
   * assigns the owner in Backoffice → Games; the server enforces the same rule).
   */
  protected readonly devlogGames = computed(() => {
    const myId = this.meService.me()?.id;
    return myId ? this.games().filter((g) => g.developerUserId === myId) : [];
  });
  protected readonly buildTag = computed(() => this.model().buildTag);
  protected readonly branchTag = computed(() => this.model().branchTag);
  protected readonly testBranchUrl = computed(() => this.model().testBranchUrl);
  protected readonly devlogClip = signal<DevlogMediaEntry | null>(null);
  protected readonly devlogBefore = signal<DevlogMediaEntry | null>(null);
  protected readonly devlogAfter = signal<DevlogMediaEntry | null>(null);
  protected readonly patchLines = computed(() => this.model().patchLines);
  protected readonly devlogSequence = signal<DevlogNextSequenceModel | null>(null);
  protected readonly devlogFollowerCount = signal<number | null>(null);

  /** Identity card name: the game's studio, else the developer's studio name, else the username. */
  protected readonly devlogStudioName = computed(
    () =>
      this.devlogSequence()?.studio ||
      this.meService.me()?.studioName ||
      this.authService.currentUser()?.username ||
      '',
  );
  protected readonly devlogAvatarUrl = computed(() => this.meService.me()?.avatarUrl ?? null);
  protected readonly devlogGameName = computed(() => {
    const id = this.devlogGameId();
    return id === null ? null : (this.games().find((g) => g.id === id)?.name ?? this.devlogSequence()?.gameName ?? null);
  });
  protected readonly devlogFollowerLabel = computed(() => formatCount(this.devlogFollowerCount() ?? 0));

  // ─── Poll sheet ────────────────────────────────────────────────
  private pollOptionInputs = viewChildren<ElementRef<HTMLInputElement>>('pollOptionInput');
  protected readonly pollQuestion = computed(() => this.model().pollQuestion);
  protected readonly pollOptions = computed(() => this.model().pollOptions);
  protected readonly pollDuration = signal<PollDuration>('24h');
  protected readonly pollGameId = computed(() => idOrNull(this.model().pollGameId));
  /** The design draws the switch on by default. */
  protected readonly pollHideResults = signal(true);

  // ─── Drafts ("···" menu) ───────────────────────────────────────
  protected readonly drafts = signal<PostModel[]>([]);
  protected readonly isLoadingDrafts = signal(false);
  protected readonly draftBusyId = signal<string | null>(null);

  protected readonly isSubmitting = signal(false);
  protected readonly isSavingDraft = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly noticeMessage = signal<string | null>(null);

  constructor() {
    // Picking a game in the DevLog sheet loads its "DEVLOG #n" preview and follower count.
    effect((onCleanup) => {
      const gameId = this.devlogGameId();
      this.devlogSequence.set(null);
      this.devlogFollowerCount.set(null);
      if (gameId === null || this.openSheet() !== 'devlog') {
        return;
      }
      const seqSub = this.devlogMeta.nextSequence(gameId).subscribe({
        next: (seq) => this.devlogSequence.set(seq),
        error: () => void 0,
      });
      const countSub = this.devlogMeta.followerCount(gameId).subscribe({
        next: (res) => this.devlogFollowerCount.set(res.followerCount),
        error: () => void 0,
      });
      onCleanup(() => {
        seqSub.unsubscribe();
        countSub.unsubscribe();
      });
    });
  }

  ngOnInit(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  ngOnDestroy(): void {
    this.revoke(this.previewUrl());
    for (const entry of [this.devlogClip(), this.devlogBefore(), this.devlogAfter()]) {
      this.revoke(entry?.previewUrl ?? null);
    }
    for (const entry of this.screenshotFiles()) {
      this.revoke(entry.previewUrl);
    }
  }

  selectTab(tab: ComposerTab): void {
    this.openSheet.set(null);
    this.isReviewSheetOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.selectedTab.set(this.selectedTab() === tab ? null : tab);
    this.errorMessage.set(null);
    this.noticeMessage.set(null);
  }

  openSheetFor(sheet: 'poll' | 'devlog'): void {
    if (sheet === 'devlog' && !this.isDevlogAllowed()) {
      return;
    }
    this.isReviewSheetOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.selectedTab.set(null);
    this.openSheet.set(sheet);
    this.errorMessage.set(null);
    this.noticeMessage.set(null);
  }

  closeSheet(): void {
    this.openSheet.set(null);
    this.errorMessage.set(null);
  }

  openReviewSheet(): void {
    this.openSheet.set(null);
    this.selectedTab.set(null);
    this.isMoreMenuOpen.set(false);
    this.isReviewSheetOpen.set(true);
    this.errorMessage.set(null);
  }

  onReviewPosted(post: PostModel): void {
    this.posted.emit(post);
    this.isReviewSheetOpen.set(false);
  }

  // ─── "···" more post types + drafts ─────────────────────────────
  toggleMoreMenu(): void {
    const open = !this.isMoreMenuOpen();
    this.isMoreMenuOpen.set(open);
    if (open) {
      this.loadDrafts();
    }
  }

  closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  private loadDrafts(): void {
    this.isLoadingDrafts.set(true);
    this.postService
      .getDrafts()
      .pipe(finalize(() => this.isLoadingDrafts.set(false)))
      .subscribe({
        next: (drafts) => this.drafts.set(drafts),
        error: () => this.drafts.set([]),
      });
  }

  draftLabel(draft: PostModel): string {
    return draft.devlog?.title || draft.caption || `${draft.postType} draft`;
  }

  publishDraft(draft: PostModel): void {
    this.draftBusyId.set(draft.id);
    this.postService
      .publishDraft(draft.id)
      .pipe(finalize(() => this.draftBusyId.set(null)))
      .subscribe({
        next: (post) => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.posted.emit(post);
          this.refreshMe();
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Could not publish the draft.')),
      });
  }

  deleteDraft(draft: PostModel): void {
    this.draftBusyId.set(draft.id);
    this.postService
      .deleteDraft(draft.id)
      .pipe(finalize(() => this.draftBusyId.set(null)))
      .subscribe({
        next: () => {
          this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
          this.refreshMe();
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Could not delete the draft.')),
      });
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

  // ─── Screenshot tags ───────────────────────────────────────────
  hasTag(tag: string): boolean {
    return this.screenshotTags().includes(tag);
  }

  toggleTag(tag: string): void {
    if (this.hasTag(tag)) {
      this.screenshotTags.update((tags) => tags.filter((t) => t !== tag));
    } else if (this.screenshotTags().length < MAX_POST_TAGS) {
      this.screenshotTags.update((tags) => [...tags, tag]);
    }
  }

  startAddingTag(): void {
    if (this.screenshotTags().length >= MAX_POST_TAGS) {
      this.errorMessage.set(`At most ${MAX_POST_TAGS} tags.`);
      return;
    }
    this.isAddingTag.set(true);
    afterNextRender(() => this.tagInputRef()?.nativeElement.focus(), { injector: this.injector });
  }

  commitTag(): void {
    const tag = this.newTag().trim().replace(/^#/, '');
    if (tag && !this.screenshotTags().some((t) => t.toLowerCase() === tag.toLowerCase())) {
      this.screenshotTags.update((tags) => [...tags, tag.slice(0, MAX_POST_TAG_LENGTH)].slice(0, MAX_POST_TAGS));
    }
    this.patchModel({ newTag: '' });
    this.isAddingTag.set(false);
  }

  cancelTag(): void {
    this.patchModel({ newTag: '' });
    this.isAddingTag.set(false);
  }

  // ─── Devlog media band ──────────────────────────────────────────
  triggerDevlogClip(): void {
    this.devlogVideoInputRef()?.nativeElement.click();
  }

  triggerDevlogBeforeAfter(): void {
    this.devlogPhotoInputRef()?.nativeElement.click();
  }

  onDevlogClipSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      this.setDevlogMedia(this.devlogClip, file);
    }
  }

  /** "▣ Before / after": the first picked image is Before, the second After (a single pick fills the empty slot). */
  onDevlogPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 2);
    input.value = '';
    if (files.length === 2) {
      this.setDevlogMedia(this.devlogBefore, files[0]);
      this.setDevlogMedia(this.devlogAfter, files[1]);
    } else if (files.length === 1) {
      this.setDevlogMedia(this.devlogBefore() && !this.devlogAfter() ? this.devlogAfter : this.devlogBefore, files[0]);
    }
  }

  removeDevlogMedia(slot: 'clip' | 'before' | 'after'): void {
    const target = slot === 'clip' ? this.devlogClip : slot === 'before' ? this.devlogBefore : this.devlogAfter;
    this.revoke(target()?.previewUrl ?? null);
    target.set(null);
  }

  private setDevlogMedia(target: WritableSignal<DevlogMediaEntry | null>, file: File): void {
    this.revoke(target()?.previewUrl ?? null);
    target.set({ file, previewUrl: URL.createObjectURL(file) });
  }

  // ─── Devlog patch lines ─────────────────────────────────────────
  addPatchLine(status: PatchLineStatus = PatchLineStatus.Shipped): void {
    this.patchModel({ patchLines: [...this.patchLines(), { text: '', status }] });
    afterNextRender(() => this.patchInputs().at(-1)?.nativeElement.focus(), { injector: this.injector });
  }

  /** "◷ Open a bug thread" — an Investigating patch line; the thread itself is the post's comments. */
  openBugThread(): void {
    this.addPatchLine(PatchLineStatus.Investigating);
  }

  cyclePatchStatus(index: number): void {
    this.patchModel({
      patchLines: this.patchLines().map((line, i) => {
        if (i !== index) return line;
        const next = PATCH_STATUS_CYCLE[(PATCH_STATUS_CYCLE.indexOf(line.status) + 1) % PATCH_STATUS_CYCLE.length];
        return { ...line, status: next };
      }),
    });
  }

  patchStatusLabel(status: PatchLineStatus): string {
    return status === PatchLineStatus.Shipped ? 'Shipped' : status === PatchLineStatus.Fixed ? 'Fixed' : 'Investigating';
  }

  /** Backspace in an empty line removes it (the design draws no per-line remove button). */
  onPatchKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.patchLines()[index]?.text) {
      event.preventDefault();
      this.patchModel({ patchLines: this.patchLines().filter((_, i) => i !== index) });
      afterNextRender(() => this.patchInputs().at(Math.max(index - 1, 0))?.nativeElement.focus(), {
        injector: this.injector,
      });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.addPatchLine();
    }
  }

  // ─── Poll options ────────────────────────────────────────────────
  addPollOption(): void {
    if (this.pollOptions().length < MAX_POLL_OPTIONS) {
      this.patchModel({ pollOptions: [...this.pollOptions(), ''] });
      afterNextRender(() => this.pollOptionInputs().at(-1)?.nativeElement.focus(), { injector: this.injector });
    }
  }

  /** Typing into the trailing "Add an option" row turns it into a real option. */
  onGhostOptionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    input.value = '';
    if (!value || this.pollOptions().length >= MAX_POLL_OPTIONS) {
      return;
    }
    this.patchModel({ pollOptions: [...this.pollOptions(), value] });
    afterNextRender(
      () => {
        const el = this.pollOptionInputs().at(-1)?.nativeElement;
        el?.focus();
        el?.setSelectionRange(value.length, value.length);
      },
      { injector: this.injector },
    );
  }

  removePollOption(index: number): void {
    this.patchModel({ pollOptions: this.pollOptions().filter((_, i) => i !== index) });
  }

  /** The rich-text toolbar rewrites the devlog body (bold / list markup around the selection). */
  setDevlogBody(body: string): void {
    this.patchModel({ devlogBody: body });
  }

  // ─── Submit ─────────────────────────────────────────────────────
  submit(): void {
    this.send(false);
  }

  saveDraft(): void {
    this.send(true);
  }

  private send(asDraft: boolean): void {
    this.errorMessage.set(null);
    this.noticeMessage.set(null);
    // A draft may be partial (the server relaxes required fields and re-checks them on publish).
    const validationError = asDraft ? this.validateDraft() : this.validate();
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    const submittedType = this.activePostType()!;
    const busy = asDraft ? this.isSavingDraft : this.isSubmitting;
    busy.set(true);
    this.postService
      .createPost(this.buildFormData(submittedType, asDraft))
      .pipe(finalize(() => busy.set(false)))
      .subscribe({
        next: (post) => {
          if (asDraft) {
            this.noticeMessage.set('Draft saved — find it under ··· in the composer.');
          } else {
            this.posted.emit(post);
          }
          this.refreshMe();
          this.resetTypeForm(submittedType);
          this.openSheet.set(null);
          this.selectedTab.set(null);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to publish post. Please try again.')),
      });
  }

  private refreshMe(): void {
    this.meService.refresh().subscribe({ error: () => void 0 });
  }

  private validate(): string | null {
    const type = this.activePostType();
    if (type === null) {
      return 'Pick a post type first — clip, screenshots, review, poll or devlog.';
    }
    switch (type) {
      case PostType.Clip:
        return this.validateClip();
      case PostType.Screenshots:
        return this.validateScreenshots();
      case PostType.Devlog:
        return this.validateDevlog();
      case PostType.Poll:
        return this.validatePoll();
      default:
        return null;
    }
  }

  private validateDraft(): string | null {
    const type = this.activePostType();
    if (type === PostType.Devlog) {
      if (!this.isDevlogAllowed()) {
        return 'Only developer accounts can publish devlogs.';
      }
      if (this.devlogGameId() === null) {
        return 'Pick the game this DevLog is about.';
      }
      return null;
    }
    if (type === PostType.Poll) {
      return null;
    }
    return this.validate();
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
      return `Title must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
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
    if (this.devlogGameId() === null) {
      return 'Pick the game this DevLog is about.';
    }
    if (this.devlogSequence()?.canPublish === false) {
      return 'Only the game’s developer account can publish DevLogs for it.';
    }
    if (!this.devlogTitle().trim()) {
      return 'Headline is required.';
    }
    if (this.devlogTitle().length > MAX_TITLE_LENGTH) {
      return `Headline must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    if (!this.devlogBody().trim()) {
      return 'Tell people what changed — the body is required.';
    }
    if (this.devlogBody().length > MAX_BODY_LENGTH) {
      return `Body must be ${MAX_BODY_LENGTH} characters or fewer.`;
    }
    if (this.buildTag().length > MAX_TAG_LENGTH) {
      return `Build tag must be ${MAX_TAG_LENGTH} characters or fewer.`;
    }
    const url = this.testBranchUrl().trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      return 'Test branch link must start with http:// or https://.';
    }
    const clip = this.devlogClip()?.file;
    if (clip && (!VIDEO_MIME_TYPES.includes(clip.type) || clip.size > MAX_VIDEO_BYTES)) {
      return 'In-engine clip must be an mp4, mov or webm video of 100MB or less.';
    }
    for (const photo of [this.devlogBefore()?.file, this.devlogAfter()?.file]) {
      if (photo && (!PHOTO_MIME_TYPES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES)) {
        return 'Before / after images must be jpg, png or webp, 5MB or less.';
      }
    }
    return null;
  }

  private validatePoll(): string | null {
    if (!this.pollQuestion().trim()) {
      return 'Ask the feed something — the question is required.';
    }
    if (this.pollQuestion().length > MAX_CAPTION_LENGTH) {
      return `Question must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
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

  private buildFormData(type: PostType, asDraft: boolean): FormData {
    const formData = new FormData();
    formData.append('PostType', String(type));
    if (asDraft) {
      formData.append('IsDraft', 'true');
    }

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
        if (this.caption().trim()) {
          formData.append('Caption', this.caption().trim());
        }
        if (this.squadId() !== null) {
          formData.append('SquadId', String(this.squadId()));
        }
        for (const tag of this.screenshotTags()) {
          formData.append('Tags', tag);
        }
        formData.append('MediaType', String(PostMediaType.Photo));
        formData.append('PhotoType', String(PostPhotoType.Screenshot));
        for (const entry of this.screenshotFiles()) {
          formData.append('Media', entry.file);
        }
        break;
      }
      case PostType.Devlog: {
        formData.append('Title', this.devlogTitle().trim());
        formData.append('Body', this.devlogBody().trim());
        formData.append('GameId', String(this.devlogGameId()));
        if (this.buildTag().trim()) {
          formData.append('BuildTag', this.buildTag().trim().toUpperCase());
        }
        formData.append('BranchTag', this.branchTag());
        if (this.testBranchUrl().trim()) {
          formData.append('TestBranchUrl', this.testBranchUrl().trim());
        }
        const lines = this.patchLines().filter((line) => line.text.trim().length > 0);
        if (lines.length > 0) {
          const payload = lines.map((line) => ({ text: line.text.trim(), status: PatchLineStatus[line.status] }));
          formData.append('PatchLinesJson', JSON.stringify(payload));
        }
        formData.append('MediaType', String(PostMediaType.Photo));
        const band: [DevlogMediaEntry | null, string][] = [
          [this.devlogClip(), 'InEngine'],
          [this.devlogBefore(), 'Before'],
          [this.devlogAfter(), 'After'],
        ];
        for (const [entry, role] of band) {
          if (entry) {
            formData.append('Media', entry.file);
            formData.append('MediaRoles', role);
          }
        }
        if (this.devlogBefore() || this.devlogAfter()) {
          formData.append('PhotoType', String(PostPhotoType.Screenshot));
        }
        break;
      }
      case PostType.Poll: {
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
    const hours = POLL_DURATIONS.find((d) => d.key === this.pollDuration())!.hours;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private resetTypeForm(type: PostType): void {
    switch (type) {
      case PostType.Clip:
        this.patchModel({ gameId: '', caption: '', squadId: this.preselectedSquadId() ?? '' });
        this.setFile(null);
        break;
      case PostType.Screenshots:
        this.patchModel({ caption: '', squadId: this.preselectedSquadId() ?? '' });
        this.screenshotTags.set([]);
        for (const entry of this.screenshotFiles()) {
          this.revoke(entry.previewUrl);
        }
        this.screenshotFiles.set([]);
        break;
      case PostType.Devlog:
        this.patchModel({
          devlogTitle: '',
          devlogBody: '',
          devlogGameId: '',
          buildTag: '',
          branchTag: 'TEST BRANCH',
          testBranchUrl: '',
          patchLines: [],
        });
        this.removeDevlogMedia('clip');
        this.removeDevlogMedia('before');
        this.removeDevlogMedia('after');
        break;
      case PostType.Poll:
        this.patchModel({ pollQuestion: '', pollOptions: ['', ''], pollGameId: '' });
        this.pollDuration.set('24h');
        this.pollHideResults.set(true);
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

  private revoke(url: string | null): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

/** 12400 → "12.4k", 1_200_000 → "1.2M". */
function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(value);
}
