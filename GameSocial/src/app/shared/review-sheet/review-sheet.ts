import { Component, OnInit, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, max, maxLength, min } from '@angular/forms/signals';
import { SelectControl } from '../select-control';
import { finalize } from 'rxjs';
import { GameModel } from '../../models/game.model';
import { PlayStatusName, PostModel } from '../../models/post.model';
import { PlayStatus, PostMediaType, PostType } from '../../models/post-enums.model';
import { PostService } from '../../services/post/post.service';
import { MeService } from '../../services/me/me.service';
import { AuthService } from '../../services/auth/auth.service';
import { XpAwardsService } from '../../services/config/xp-awards.service';
import { extractApiErrorMessage } from '../api-error.util';
import { formatClock, formatTimeAgo } from '../clip-format';
import { SheetModal } from '../sheet-modal/sheet-modal';
import { StarRating } from '../star-rating/star-rating';
import { RichTextToolbar } from '../rich-text/rich-text-toolbar';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;
const MAX_EMBEDDED_CLIPS = 4;

const STATUS_BY_NAME: Record<PlayStatusName, PlayStatus> = {
  Finished: PlayStatus.Finished,
  StillPlaying: PlayStatus.StillPlaying,
  Dropped: PlayStatus.Dropped,
};

/** Snapshot of the form, used to tell whether a resumed/saved draft was edited since. */
interface ReviewFormState {
  gameId: number | null;
  headline: string;
  body: string;
  score: number;
  hoursPlayed: number | null;
  playStatus: PlayStatus;
  spoilerFree: boolean;
  clipIds: string[];
}

/**
 * "Write a review" sheet — the design's sheetReview state (08-sheets L55-103):
 * game card with click-to-rate stars, status chips + "Spoiler-free ✓", the
 * headline field, the rich-text toolbar ("▶ Embed clip" included), the XP /
 * playtime line and Cancel · Save draft · Publish review.
 *
 * There is no tracked playtime (no Steam integration): hours are self-reported
 * in the game card, prefilled from your latest review of that game.
 *
 * Drafts: "Save draft" creates a Review with IsDraft=true (replacing the draft
 * it was resumed from). "Publish review" publishes that draft as-is via
 * publishDraft when nothing changed since, otherwise creates a published post
 * and removes the stale draft.
 */
/** Absolute cap on self-reported hours (mirrors ReviewHoursRules.AbsoluteMaxHours). */
const MAX_HOURS = 10_000;

@Component({
  selector: 'app-review-sheet',
  imports: [ImgFallback, FormField, SelectControl, SheetModal, StarRating, RichTextToolbar],
  templateUrl: './review-sheet.html',
  styleUrl: './review-sheet.scss',
})
export class ReviewSheet implements OnInit {
  private postService = inject(PostService);
  private meService = inject(MeService);
  private authService = inject(AuthService);
  private xpAwards = inject(XpAwardsService);

  games = input.required<GameModel[]>();
  /** Optional pre-fill — e.g. the Reviews page's "Waiting for your review" Rate CTA. */
  preselectedGameId = input<number | null>(null);

  closed = output<void>();
  posted = output<PostModel>();

  protected readonly PlayStatus = PlayStatus;
  protected readonly formatClock = formatClock;
  protected readonly formatTimeAgo = formatTimeAgo;

  /** One review per game: games you already reviewed are left out of the picker (the server enforces it too). */
  protected readonly reviewableGames = computed(() => {
    const reviewed = this.meService.me()?.reviewedGameIds ?? [];
    return this.games().filter((g) => !reviewed.includes(g.id));
  });
  /**
   * The game select's value (Signal Forms): the game id as text, '' = none. Kept apart from the
   * rest of the form so the preselect input resets only the game, as before.
   */
  private readonly gameIdValue = linkedSignal(() => {
    const preselected = this.preselectedGameId();
    const reviewed = (this.meService.me()?.reviewedGameIds ?? []).includes(preselected ?? -1);
    return preselected === null || reviewed ? '' : String(preselected);
  });
  protected readonly gameField = form(this.gameIdValue);
  protected readonly gameId = computed(() => (this.gameIdValue() ? Number(this.gameIdValue()) : null));

  /**
   * Headline, body, hours, score, status, spoiler flag (Signal Forms). `hoursPlayed` is NaN until the
   * user enters a number — the number input shows NaN as empty (placeholder "0").
   */
  private readonly model = signal({
    headline: '',
    body: '',
    hoursPlayed: NaN,
    score: 7,
    playStatus: PlayStatus.Finished,
    spoilerFree: true,
  });
  protected readonly headline = computed(() => this.model().headline);
  protected readonly body = computed(() => this.model().body);
  protected readonly score = computed(() => this.model().score);
  /** Whole, non-negative hours; null while the field is empty. */
  protected readonly hoursPlayed = computed(() => {
    const hours = this.model().hoursPlayed;
    return Number.isNaN(hours) ? null : Math.max(0, Math.floor(hours));
  });
  protected readonly playStatus = computed(() => this.model().playStatus);
  protected readonly spoilerFree = computed(() => this.model().spoilerFree);
  protected readonly embeddedClipIds = signal<string[]>([]);

  protected readonly isPickingGame = signal(false);
  protected readonly isPickingClip = signal(false);
  protected readonly myClips = signal<PostModel[]>([]);
  protected readonly isLoadingClips = signal(false);

  /** A Review draft offered for resuming when the sheet opens. */
  protected readonly resumableDraft = signal<PostModel | null>(null);
  /** The draft currently loaded/saved in the form, and its snapshot. */
  private readonly activeDraftId = signal<string | null>(null);
  private readonly activeDraftState = signal<ReviewFormState | null>(null);

  protected readonly isSubmitting = signal(false);
  protected readonly isSavingDraft = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly draftSavedAt = signal<string | null>(null);

  protected readonly selectedGame = computed(() => this.reviewableGames().find((g) => g.id === this.gameId()) ?? null);
  protected readonly reviewXp = computed(() => this.xpAwards.amount('review'));
  protected readonly hoursLabel = computed(() => (this.hoursPlayed() ?? 0).toString());
  /** Same cap as the server (ReviewHoursRules): hours since release for released games, 10,000 at most. */
  protected readonly maxHours = computed(() => {
    const release = this.selectedGame()?.releaseDate;
    const released = release ? Date.parse(release + 'T00:00:00Z') : NaN;
    if (Number.isNaN(released) || released > Date.now()) {
      return MAX_HOURS;
    }
    return Math.min(MAX_HOURS, Math.ceil((Date.now() - released) / 3_600_000));
  });

  /** Limits become the inputs' native min / max / maxlength; submit() still reports the messages. */
  protected readonly reviewForm = form(this.model, (path) => {
    maxLength(path.headline, MAX_TITLE_LENGTH);
    maxLength(path.body, MAX_BODY_LENGTH);
    min(path.hoursPlayed, 0);
    max(path.hoursPlayed, () => this.maxHours());
  });
  protected readonly scoreLabel = computed(() => this.score().toFixed(1));
  protected readonly embeddedClips = computed(() => {
    const ids = this.embeddedClipIds();
    return this.myClips().filter((c) => ids.includes(c.id));
  });

  constructor() {
    // Prefill hours/status from your latest published review of the chosen game.
    effect(() => {
      const gameId = this.gameId();
      const userId = this.authService.currentUser()?.id;
      if (gameId === null || !userId) {
        return;
      }
      untracked(() => this.prefillFromLatestReview(gameId, userId));
    });
  }

  ngOnInit(): void {
    this.postService.getDrafts('Review').subscribe({
      next: (drafts) => {
        const preferred = this.preselectedGameId();
        const draft = (preferred !== null ? drafts.find((d) => d.gameId === preferred) : undefined) ?? drafts[0] ?? null;
        this.resumableDraft.set(draft);
      },
      error: () => void 0,
    });
  }

  /** The game select changed (the value itself is already in `gameIdValue`). */
  onGameChanged(): void {
    this.isPickingGame.set(false);
    this.embeddedClipIds.set([]);
    this.myClips.set([]);
    this.isPickingClip.set(false);
  }

  toggleSpoilerFree(): void {
    this.model.update((m) => ({ ...m, spoilerFree: !m.spoilerFree }));
  }

  setScore(score: number): void {
    this.model.update((m) => ({ ...m, score }));
  }

  setPlayStatus(playStatus: PlayStatus): void {
    this.model.update((m) => ({ ...m, playStatus }));
  }

  /** The rich-text toolbar rewrote the textarea (bold, quote, spoiler…). */
  setBody(body: string): void {
    this.model.update((m) => ({ ...m, body }));
  }

  toggleClipPicker(): void {
    const open = !this.isPickingClip();
    this.isPickingClip.set(open);
    if (open && this.myClips().length === 0) {
      this.loadMyClips();
    }
  }

  toggleClip(id: string): void {
    this.embeddedClipIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= MAX_EMBEDDED_CLIPS ? ids : [...ids, id],
    );
  }

  isClipSelected(id: string): boolean {
    return this.embeddedClipIds().includes(id);
  }

  clipDuration(clip: PostModel): string {
    return formatClock(clip.media.find((m) => m.mediaType === 'Video')?.durationSeconds);
  }

  resumeDraft(): void {
    const draft = this.resumableDraft();
    if (!draft?.review) {
      return;
    }
    this.gameIdValue.set(draft.gameId != null ? String(draft.gameId) : '');
    this.model.set({
      headline: draft.caption ?? '',
      body: draft.review.body ?? '',
      hoursPlayed: draft.review.hoursPlayed ?? NaN,
      score: draft.review.score,
      playStatus: STATUS_BY_NAME[draft.review.playStatus] ?? PlayStatus.Finished,
      spoilerFree: draft.review.spoilerFree,
    });
    this.embeddedClipIds.set(draft.review.embeddedClipPostIds ?? []);
    if ((draft.review.embeddedClipPostIds ?? []).length > 0) {
      this.loadMyClips();
    }
    this.activeDraftId.set(draft.id);
    this.activeDraftState.set(this.snapshot());
    this.resumableDraft.set(null);
  }

  dismissDraft(): void {
    this.resumableDraft.set(null);
  }

  saveDraft(): void {
    this.errorMessage.set(null);
    if (this.gameId() === null) {
      this.errorMessage.set('Please select a game.');
      return;
    }
    this.isSavingDraft.set(true);
    const previousDraftId = this.activeDraftId();
    this.postService
      .createPost(this.buildFormData(true))
      .pipe(finalize(() => this.isSavingDraft.set(false)))
      .subscribe({
        next: (draft) => {
          this.activeDraftId.set(draft.id);
          this.activeDraftState.set(this.snapshot());
          this.draftSavedAt.set(draft.createdAt);
          if (previousDraftId) {
            this.postService.deleteDraft(previousDraftId).subscribe({ error: () => void 0 });
          }
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to save draft. Please try again.')),
      });
  }

  submit(): void {
    this.errorMessage.set(null);
    const validationError = this.validate();
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    this.isSubmitting.set(true);
    const draftId = this.activeDraftId();
    const unchangedDraft = draftId !== null && this.isSameState(this.activeDraftState(), this.snapshot());
    const request = unchangedDraft ? this.postService.publishDraft(draftId!) : this.postService.createPost(this.buildFormData(false));

    request.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
      next: (post) => {
        if (draftId && !unchangedDraft) {
          this.postService.deleteDraft(draftId).subscribe({ error: () => void 0 });
        }
        this.posted.emit(post);
        // Publishing a review awards XP — refresh live state.
        this.meService.refresh().subscribe({ error: () => void 0 });
      },
      error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to publish review. Please try again.')),
    });
  }

  private prefillFromLatestReview(gameId: number, userId: string): void {
    this.postService.getPosts(1, 1, { postType: 'Review', userId, gameId, sort: 'new' }).subscribe({
      next: (result) => {
        const latest = result.items[0]?.review;
        if (latest && this.gameId() === gameId && this.hoursPlayed() === null) {
          this.model.update((m) => ({ ...m, hoursPlayed: latest.hoursPlayed }));
        }
      },
      error: () => void 0,
    });
  }

  private loadMyClips(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return;
    }
    this.isLoadingClips.set(true);
    this.postService
      .getPosts(1, 20, { postType: 'Clip', userId, gameId: this.gameId() ?? undefined, sort: 'new' })
      .pipe(finalize(() => this.isLoadingClips.set(false)))
      .subscribe({
        next: (result) => this.myClips.set(result.items),
        error: () => void 0,
      });
  }

  private snapshot(): ReviewFormState {
    return {
      gameId: this.gameId(),
      headline: this.headline(),
      body: this.body(),
      score: this.score(),
      hoursPlayed: this.hoursPlayed(),
      playStatus: this.playStatus(),
      spoilerFree: this.spoilerFree(),
      clipIds: [...this.embeddedClipIds()],
    };
  }

  private isSameState(a: ReviewFormState | null, b: ReviewFormState): boolean {
    return a !== null && JSON.stringify(a) === JSON.stringify(b);
  }

  private validate(): string | null {
    if (this.gameId() === null) {
      return 'Please select a game.';
    }
    if (!this.headline().trim()) {
      return 'Headline is required.';
    }
    if (this.headline().length > MAX_TITLE_LENGTH) {
      return `Headline must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    if (!this.body().trim()) {
      return 'Review body is required.';
    }
    if (this.body().length > MAX_BODY_LENGTH) {
      return `Body must be ${MAX_BODY_LENGTH} characters or fewer.`;
    }
    if (this.score() < 0 || this.score() > 10) {
      return 'Score must be between 0 and 10.';
    }
    if (this.hoursPlayed() === null || this.hoursPlayed()! < 0) {
      return 'Please enter your hours played.';
    }
    if (this.hoursPlayed()! > this.maxHours()) {
      return `Hours played can be at most ${this.maxHours()} for this game (time since its release).`;
    }
    return null;
  }

  private buildFormData(isDraft: boolean): FormData {
    const formData = new FormData();
    formData.append('PostType', String(PostType.Review));
    formData.append('GameId', String(this.gameId()));
    formData.append('Caption', this.headline().trim());
    formData.append('Body', this.body().trim());
    formData.append('Score', this.score().toFixed(1));
    formData.append('PlayStatus', String(this.playStatus()));
    formData.append('HoursPlayed', String(this.hoursPlayed() ?? 0));
    formData.append('SpoilerFree', String(this.spoilerFree()));
    formData.append('MediaType', String(PostMediaType.Photo));
    formData.append('IsDraft', String(isDraft));
    for (const id of this.embeddedClipIds()) {
      formData.append('EmbeddedClipPostIds', id);
    }
    return formData;
  }
}
