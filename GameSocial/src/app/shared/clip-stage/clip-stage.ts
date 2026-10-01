import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PostModel } from '../../models/post.model';
import { HotMomentModel } from '../../models/clip.model';
import { LikeService } from '../../services/like/like.service';
import { PostService } from '../../services/post/post.service';
import { NotificationService } from '../../services/notification/notification.service';
import { clipVideo, formatClock, formatCount, formatTimeAgo, formatViews } from '../clip-format';
import { shareClip } from './clip-share';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

/**
 * <app-clip-stage> — the one clip surface. A real <video> with the design's
 * own chrome on top instead of native controls.
 *
 * ## Variants (`variant` input)
 *  - `feed` (default): Gamer Feed.dc.html "CLIP OF THE DAY" card — fixed 372px
 *    stage, mute / speed / ⛶ actions, title + author + LV + ▲ + 💬 overlay,
 *    seek bar, clock and views.
 *  - `hero`: the Clips page player (`onClipsPage`) — fills its column, rank +
 *    game badges, buffered range, #FFB020 hot-moment markers, scrub-hover
 *    time bubble; ⛶ opens the Clip Player page (`/clips/:id?t=`).
 *  - `inline`: Clip Player spec "In-feed inline muted autoplay" — 16:9, 14px
 *    radius, autoplays muted while ≥60% visible, game tag, 🔇 toggle and a
 *    30px pause button + 4px progress + clock. Clicking the picture opens
 *    `/clips/:id`.
 *  - `full`: Clip Player spec main player — 16:9, 18px radius, top bar (game
 *    tag, quality tag, ···), full control row (play, ⏮ ⏭, volume slider,
 *    clock, speed, CC, ⚙ quality menu, ▭ theater, ⛶), hover preview frame.
 *  - `vertical`: Clip Player spec "Vertical clip (mobile)" — 9:16, pulsing
 *    dot + `rankLabel`, right action column (▲ ◉ ↗), title/@author/3px bar.
 *
 * Every variant's ⛶ (except `hero`) opens the in-app fullscreen overlay from
 * 06-fullscreen-player.html (not the browser's fullscreen API): title strip,
 * "✕ Tam ekrandan çık", 88px play, control row with the ▲ vote pill. Esc
 * closes it.
 *
 * ## Inputs (all optional except `post`)
 * `post`, `variant`, `rankLabel` ('CLIP'), `squadName`, `commentCount`,
 * `commentsActive`, `autoplay` (play as soon as a new clip loads), `startAt`
 * (seconds, applied when a clip loads), `hotMoments` (markers), `hasPrev` /
 * `hasNext` (full), `theater` (full, ▭ pressed state).
 *
 * ## Outputs
 * `toggleComments`, `openFull` (kept for older callers), `ended`,
 * `timeChanged(seconds)`, `playingChange(boolean)`, `prev`, `next`,
 * `theaterToggle`.
 *
 * ## Methods
 * `seekTo(seconds, play = true)`, `play()`, `pause()`, `currentSeconds()`,
 * `isPlaying()`.
 *
 * Keyboard: Space play/pause, ←/→ ±5 s, Esc leaves the overlay — active for
 * `hero`/`full` stages page-wide, and for the others while focus is inside.
 * A view is recorded (`POST posts/{id}/view`) once playback passes 3 s.
 */
export type ClipStageVariant = 'feed' | 'hero' | 'inline' | 'full' | 'vertical';

const SPEEDS = [0.5, 1, 1.5, 2];
const SEEK_STEP = 5;
const VIEW_AFTER_SECONDS = 3;

@Component({
  selector: 'app-clip-stage',
  imports: [ImgFallback, RouterLink, NgTemplateOutlet],
  templateUrl: './clip-stage.html',
  styleUrl: './clip-stage.scss',
  host: {
    '[class.variant-feed]': "variant() === 'feed'",
    '[class.variant-hero]': "variant() === 'hero'",
    '[class.variant-inline]': "variant() === 'inline'",
    '[class.variant-full]': "variant() === 'full'",
    '[class.variant-vertical]': "variant() === 'vertical'",
    '[class.is-overlay]': 'overlay()',
    '(document:keydown)': 'onKeydown($event)',
    '(document:click)': 'closeMenus($event)',
  },
})
export class ClipStage {
  private likeService = inject(LikeService);
  private postService = inject(PostService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  post = input.required<PostModel>();
  variant = input<ClipStageVariant>('feed');
  /** Red badge in the top-left corner — the design's ranking chip; each caller passes a label it can honestly fill. */
  rankLabel = input('CLIP');
  /** Squad this clip was cross-posted to, when the viewer can resolve the name — rendered as a second overlay badge. */
  squadName = input<string | undefined>(undefined);
  /** Live comment count when the host keeps its own (the feed card's thread adds to it). */
  commentCount = input<number | undefined>(undefined);
  commentsActive = input(false);
  /** Start playing as soon as this clip becomes the stage's source (Clips page queue). */
  autoplay = input(false);
  /** Seconds to start from when a clip loads (`?t=` deep links). */
  startAt = input<number | null>(null);
  hotMoments = input<HotMomentModel[]>([]);
  hasPrev = input(false);
  hasNext = input(false);
  theater = input(false);

  toggleComments = output<void>();
  /** Kept for callers from before the in-app overlay; the stage no longer emits it itself. */
  openFull = output<void>();
  ended = output<void>();
  timeChanged = output<number>();
  playingChange = output<boolean>();
  prev = output<void>();
  next = output<void>();
  theaterToggle = output<void>();

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly previewRef = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly playing = signal(false);
  protected readonly muted = signal(true);
  protected readonly volume = signal(1);
  protected readonly speed = signal(1);
  protected readonly currentTime = signal(0);
  protected readonly bufferedEnd = signal(0);
  protected readonly hoverRatio = signal<number | null>(null);
  protected readonly overlay = signal(false);
  protected readonly isTogglingLike = signal(false);
  protected readonly qualityMenuOpen = signal(false);
  protected readonly moreMenuOpen = signal(false);
  protected readonly captionsOn = signal(false);
  protected readonly hasCaptions = signal(false);
  private readonly scrubbing = signal(false);
  private readonly volumeDragging = signal(false);
  /** Metadata duration once known; falls back to the value the backend measured at upload. */
  private readonly loadedDuration = signal(0);
  /** Set when a new source should start playing as soon as it is ready. */
  private pendingPlay = false;
  private pendingSeek: number | null = null;
  private viewRecordedFor: string | null = null;
  private lastPreviewSeek = -1;

  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);
  protected readonly viewCount = linkedSignal(() => this.post().viewCount ?? 0);

  protected readonly media = computed(() => clipVideo(this.post().media));
  protected readonly renditions = computed(() => this.media()?.renditions ?? []);
  protected readonly quality = linkedSignal<string | null>(() => this.renditions()[0]?.label ?? null);
  protected readonly src = computed(() => {
    const label = this.quality();
    const rendition = this.renditions().find((r) => r.label === label);
    return rendition?.url ?? this.media()?.url ?? '';
  });
  protected readonly poster = computed(() => this.media()?.thumbnailUrl ?? null);
  protected readonly isProcessing = computed(() => this.media()?.processingStatus === 'Pending');
  protected readonly title = computed(() => this.post().caption?.trim() || this.post().gameName || 'Clip');
  protected readonly initial = computed(() => this.post().username.charAt(0).toUpperCase());
  protected readonly levelLabel = computed(() => `LV ${this.post().authorLevel ?? 1}`);
  protected readonly timeAgo = computed(() => formatTimeAgo(this.post().createdAt));
  protected readonly commentTotal = computed(() => this.commentCount() ?? this.post().commentCount);
  protected readonly commentLabel = computed(() => formatCount(this.commentTotal()));
  protected readonly likeLabel = computed(() => formatCount(this.likeCount()));
  protected readonly viewsLabel = computed(() => formatViews(this.viewCount()));
  protected readonly gameTag = computed(() => (this.post().gameName ?? 'CLIP').toUpperCase());

  protected readonly duration = computed(() => this.loadedDuration() || this.media()?.durationSeconds || 0);
  protected readonly playedPercent = computed(() => (this.duration() > 0 ? Math.min(100, (this.currentTime() / this.duration()) * 100) : 0));
  protected readonly bufferedPercent = computed(() => (this.duration() > 0 ? Math.min(100, (this.bufferedEnd() / this.duration()) * 100) : 0));
  protected readonly currentLabel = computed(() => formatClock(this.currentTime()));
  protected readonly durationLabel = computed(() => formatClock(this.duration()));
  protected readonly hoverLabel = computed(() => formatClock((this.hoverRatio() ?? 0) * this.duration()));
  protected readonly hoverPercent = computed(() => (this.hoverRatio() ?? 0) * 100);
  protected readonly playGlyph = computed(() => (this.playing() ? '‖' : '▶'));
  protected readonly volGlyph = computed(() => {
    if (this.muted() || this.volume() === 0) {
      return '🔇';
    }
    return this.volume() < 0.5 ? '🔉' : '🔊';
  });
  protected readonly volumePercent = computed(() => (this.muted() ? 0 : this.volume() * 100));
  protected readonly markers = computed(() => {
    const total = this.duration();
    if (total <= 0) {
      return [];
    }
    return this.hotMoments()
      .filter((m) => m.atSeconds <= total)
      .map((m) => ({ ...m, left: (m.atSeconds / total) * 100, clock: formatClock(m.atSeconds) }));
  });
  /** Which chrome to draw: the fullscreen overlay replaces the variant's own. */
  protected readonly chrome = computed(() => (this.overlay() ? 'overlay' : this.variant()));
  protected readonly isKeyboardOwner = computed(() => this.overlay() || this.variant() === 'hero' || this.variant() === 'full');

  private readonly postId = computed(() => this.post().id);
  /** Hero ⛶ hands the current position to the Clip Player page. */
  protected readonly resumeParams = computed(() => ({ t: this.currentTime() >= 1 ? Math.floor(this.currentTime()) : null }));

  constructor() {
    // A new clip in the same stage (Clips page queue) restarts from `startAt`
    // (or zero) and autoplays when the queue asked for it. play() is deferred
    // to loadedmetadata: calling it while the element is still switching
    // sources is aborted by the browser.
    effect(() => {
      this.postId();
      untracked(() => {
        this.currentTime.set(this.startAt() ?? 0);
        this.bufferedEnd.set(0);
        this.loadedDuration.set(0);
        this.pendingSeek = this.startAt();
        this.pendingPlay = this.autoplay();
        this.hoverRatio.set(null);
        this.qualityMenuOpen.set(false);
      });
    });

    afterNextRender(() => this.observeVisibility());
  }

  // ─── Public API ────────────────────────────────────────────────────────
  seekTo(seconds: number, play = true): void {
    const video = this.videoRef().nativeElement;
    const target = Math.max(0, this.duration() > 0 ? Math.min(seconds, this.duration()) : seconds);
    if (video.readyState === 0) {
      this.pendingSeek = target;
      this.pendingPlay = this.pendingPlay || play;
      this.currentTime.set(target);
      return;
    }
    video.currentTime = target;
    this.currentTime.set(target);
    this.timeChanged.emit(target);
    if (play) {
      this.play();
    }
  }

  play(): void {
    void this.videoRef().nativeElement.play().catch(() => void 0);
  }

  pause(): void {
    this.videoRef().nativeElement.pause();
  }

  currentSeconds(): number {
    return this.currentTime();
  }

  isPlaying(): boolean {
    return this.playing();
  }

  // ─── Controls ──────────────────────────────────────────────────────────
  togglePlay(): void {
    const video = this.videoRef().nativeElement;
    if (video.paused) {
      this.play();
    } else {
      video.pause();
    }
  }

  toggleMute(): void {
    this.muted.update((value) => !value);
    if (!this.muted() && this.volume() === 0) {
      this.setVolume(1);
    }
  }

  cycleSpeed(): void {
    const next = SPEEDS[(SPEEDS.indexOf(this.speed()) + 1) % SPEEDS.length];
    this.speed.set(next);
    this.videoRef().nativeElement.playbackRate = next;
  }

  /** ⛶ — the in-app fullscreen overlay (06-fullscreen-player.html). */
  toggleFullscreen(): void {
    this.overlay.update((value) => !value);
    this.qualityMenuOpen.set(false);
    this.moreMenuOpen.set(false);
    if (this.overlay()) {
      this.play();
    }
  }

  protected toggleCaptions(): void {
    const tracks = this.videoRef().nativeElement.textTracks;
    const on = !this.captionsOn();
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = on && i === 0 ? 'showing' : 'hidden';
    }
    this.captionsOn.set(on);
  }

  protected toggleQualityMenu(event: Event): void {
    event.stopPropagation();
    this.moreMenuOpen.set(false);
    this.qualityMenuOpen.update((open) => !open);
  }

  protected toggleMoreMenu(event: Event): void {
    event.stopPropagation();
    this.qualityMenuOpen.set(false);
    this.moreMenuOpen.update((open) => !open);
  }

  protected closeMenus(event: Event): void {
    if (!this.qualityMenuOpen() && !this.moreMenuOpen()) {
      return;
    }
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.qualityMenuOpen.set(false);
      this.moreMenuOpen.set(false);
    }
  }

  protected pickQuality(label: string): void {
    this.qualityMenuOpen.set(false);
    if (label === this.quality()) {
      return;
    }
    const video = this.videoRef().nativeElement;
    this.pendingSeek = video.currentTime;
    this.pendingPlay = !video.paused;
    this.quality.set(label);
  }

  protected async share(): Promise<void> {
    this.moreMenuOpen.set(false);
    const message = await shareClip(this.post());
    if (message) {
      this.notificationService.success(message);
    }
  }

  protected openClipPage(): void {
    void this.router.navigate(['/clips', this.post().id], { queryParams: { t: Math.floor(this.currentTime()) || null } });
  }

  protected seekMoment(event: Event, seconds: number): void {
    event.stopPropagation();
    this.seekTo(seconds);
  }

  toggleLike(): void {
    if (this.isTogglingLike()) {
      return;
    }
    this.isTogglingLike.set(true);
    this.likeService.toggleLike(this.post().id).subscribe({
      next: (result) => {
        this.liked.set(result.liked);
        this.likeCount.set(result.likeCount);
        this.isTogglingLike.set(false);
      },
      error: () => {
        this.isTogglingLike.set(false);
        this.notificationService.error('Failed to update like. Please try again.');
      },
    });
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────
  protected onKeydown(event: KeyboardEvent): void {
    const inside = this.host.nativeElement.contains(document.activeElement);
    if (!this.isKeyboardOwner() && !inside) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
      return;
    }
    // A modal sheet is open over the page — leave its keys alone.
    if (!this.overlay() && document.querySelector('[aria-modal="true"]')) {
      return;
    }
    switch (event.key) {
      case ' ':
      case 'Spacebar':
        // Space on a focused button/link already activates it natively.
        if (tag === 'BUTTON' || tag === 'A') {
          return;
        }
        event.preventDefault();
        this.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.seekTo(this.currentTime() - SEEK_STEP, !this.videoRef().nativeElement.paused);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.seekTo(this.currentTime() + SEEK_STEP, !this.videoRef().nativeElement.paused);
        break;
      case 'Escape':
        if (this.overlay()) {
          this.overlay.set(false);
        }
        break;
    }
  }

  // ─── Media element events ──────────────────────────────────────────────
  protected onLoadedMetadata(): void {
    const video = this.videoRef().nativeElement;
    this.loadedDuration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.hasCaptions.set(video.textTracks.length > 0);
    video.playbackRate = this.speed();
    video.volume = this.volume();
    if (this.pendingSeek !== null) {
      video.currentTime = Math.min(this.pendingSeek, video.duration || this.pendingSeek);
      this.currentTime.set(video.currentTime);
      this.pendingSeek = null;
    }
    if (this.pendingPlay) {
      this.pendingPlay = false;
      this.play();
    }
  }

  protected onTimeUpdate(): void {
    const time = this.videoRef().nativeElement.currentTime;
    if (!this.scrubbing()) {
      this.currentTime.set(time);
    }
    this.timeChanged.emit(time);
    this.maybeRecordView(time);
  }

  protected onProgress(): void {
    const video = this.videoRef().nativeElement;
    if (video.buffered.length > 0) {
      this.bufferedEnd.set(video.buffered.end(video.buffered.length - 1));
    }
  }

  protected onPlayState(playing: boolean): void {
    this.playing.set(playing);
    this.playingChange.emit(playing);
  }

  protected onEnded(): void {
    this.onPlayState(false);
    this.ended.emit();
  }

  private maybeRecordView(time: number): void {
    const id = this.post().id;
    const threshold = Math.min(VIEW_AFTER_SECONDS, Math.max(0.5, this.duration() - 0.2));
    if (this.viewRecordedFor === id || time < threshold) {
      return;
    }
    this.viewRecordedFor = id;
    this.postService.recordView(id).subscribe({
      next: (result) => {
        if (this.post().id === id) {
          this.viewCount.set(result.viewCount);
        }
      },
      error: () => void 0,
    });
  }

  // ─── Inline autoplay ───────────────────────────────────────────────────
  private observeVisibility(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (this.variant() !== 'inline' || this.overlay()) {
          return;
        }
        if (entry.intersectionRatio >= 0.6) {
          this.muted.set(true);
          this.play();
        } else {
          this.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  // ─── Scrub + volume bars ───────────────────────────────────────────────
  // Both bars are the design's own <div> tracks rather than <input type=range>:
  // the design draws a buffered range, markers, a hover bubble and a knob that
  // a native range input can't express; pointer capture gives the drag feel.
  // Keyboard users get ←/→ on the stage and the slider role's arrow keys.

  protected onScrubDown(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    this.scrubbing.set(true);
    this.scrubTo(this.ratioFrom(track, event.clientX));
  }

  protected onScrubMove(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    const ratio = this.ratioFrom(track, event.clientX);
    this.hoverRatio.set(ratio);
    this.updatePreview(ratio);
    if (this.scrubbing()) {
      this.scrubTo(ratio);
    }
  }

  protected onScrubUp(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    this.scrubbing.set(false);
  }

  protected onScrubLeave(): void {
    this.hoverRatio.set(null);
  }

  protected onScrubKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP;
      this.seekTo(this.currentTime() + step, !this.videoRef().nativeElement.paused);
    }
  }

  protected onVolumeDown(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    this.volumeDragging.set(true);
    this.setVolume(this.ratioFrom(track, event.clientX));
  }

  protected onVolumeMove(event: PointerEvent): void {
    if (!this.volumeDragging()) {
      return;
    }
    this.setVolume(this.ratioFrom(event.currentTarget as HTMLElement, event.clientX));
  }

  protected onVolumeUp(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    this.volumeDragging.set(false);
  }

  protected onVolumeKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.setVolume(this.volume() + (event.key === 'ArrowLeft' ? -0.1 : 0.1));
    }
  }

  private setVolume(ratio: number): void {
    const value = Math.min(1, Math.max(0, ratio));
    this.volume.set(value);
    this.muted.set(value === 0);
    this.videoRef().nativeElement.volume = value;
  }

  private scrubTo(ratio: number): void {
    const duration = this.duration();
    if (duration <= 0) {
      return;
    }
    const time = ratio * duration;
    this.currentTime.set(time);
    this.videoRef().nativeElement.currentTime = time;
  }

  /** Full variant: the 132×74 hover frame is a second, muted element seeked to the hover time. */
  private updatePreview(ratio: number): void {
    const preview = this.previewRef()?.nativeElement;
    if (!preview || this.duration() <= 0) {
      return;
    }
    const time = ratio * this.duration();
    if (Math.abs(time - this.lastPreviewSeek) < 0.25) {
      return;
    }
    this.lastPreviewSeek = time;
    try {
      preview.currentTime = time;
    } catch {
      // Not seekable yet — the frame catches up on the next move.
    }
  }

  private ratioFrom(element: HTMLElement, clientX: number): number {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }
}
