import { Component, ElementRef, computed, effect, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostModel } from '../../models/post.model';
import { LikeService } from '../../services/like/like.service';
import { NotificationService } from '../../services/notification/notification.service';
import { formatClock, formatTimeAgo } from '../clip-format';

const SPEEDS = [0.5, 1, 1.5, 2];

/**
 * The clip surface from the design — a real <video> with the mock's overlay
 * chrome drawn on top of it instead of the browser's native controls.
 *
 * Two variants, both taken straight from the design files:
 *  - `feed`: the "CLIP OF THE DAY" card in Gamer Feed.dc.html (fixed-height
 *    stage, mute + "Tam ekran oynatıcı" actions, title/author/vote/comment
 *    overlay, seek bar and clock at the bottom).
 *  - `hero`: the Clips page player in the same file's `onClipsPage` state
 *    (fills its column, adds the speed cycle + fullscreen actions, a buffered
 *    range behind the played range, and the scrub-hover time bubble).
 *
 * In fullscreen the compact overlay is joined by the control row specced in
 * Clip Player.dc.html (play, volume slider, clock, speed, exit) — fullscreen
 * is the one place where the native controls are gone and a volume slider is
 * actually needed.
 *
 * Deliberately not ported, because nothing in the backend backs them: the
 * quality menu (a single 720p rendition is produced, see the transcode job),
 * captions (no caption tracks), chapter/"hot moment" markers and view counts
 * (no such data), and the queue's prev/next inside the stage (the Clips page
 * owns the queue and drives selection from the rail).
 */
@Component({
  selector: 'app-clip-stage',
  imports: [RouterLink],
  templateUrl: './clip-stage.html',
  styleUrl: './clip-stage.scss',
  host: {
    '[class.variant-feed]': "variant() === 'feed'",
    '[class.variant-hero]': "variant() === 'hero'",
    '[class.is-fullscreen]': 'isFullscreen()',
    '(document:fullscreenchange)': 'syncFullscreen()',
  },
})
export class ClipStage {
  private likeService = inject(LikeService);
  private notificationService = inject(NotificationService);

  post = input.required<PostModel>();
  variant = input<'feed' | 'hero'>('feed');
  /** Red badge in the top-left corner — the design's ranking chip; each caller passes a label it can honestly fill. */
  rankLabel = input('CLIP');
  /** Squad this clip was cross-posted to, when the viewer can resolve the name — rendered as a second overlay badge. */
  squadName = input<string | undefined>(undefined);
  /** Live comment count when the host keeps its own (the feed card's thread adds to it). */
  commentCount = input<number | undefined>(undefined);
  commentsActive = input(false);
  /** Start playing as soon as this clip becomes the stage's source (Clips page queue). */
  autoplay = input(false);

  toggleComments = output<void>();
  /** `feed` variant only — the design's "Tam ekran oynatıcı" action. */
  openFull = output<void>();
  ended = output<void>();

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly stageRef = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected readonly playing = signal(false);
  protected readonly muted = signal(true);
  protected readonly volume = signal(1);
  protected readonly speed = signal(1);
  protected readonly currentTime = signal(0);
  protected readonly bufferedEnd = signal(0);
  protected readonly hoverRatio = signal<number | null>(null);
  protected readonly isFullscreen = signal(false);
  protected readonly isTogglingLike = signal(false);
  private readonly scrubbing = signal(false);
  private readonly volumeDragging = signal(false);
  /** Metadata duration once known; falls back to the value the backend measured at upload. */
  private readonly loadedDuration = signal(0);
  /** Set when a new source should start playing as soon as it is ready. */
  private readonly pendingPlay = signal(false);

  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);

  protected readonly media = computed(() => this.post().media.find((m) => m.mediaType === 'Video'));
  protected readonly src = computed(() => this.media()?.url ?? '');
  protected readonly isProcessing = computed(() => this.media()?.processingStatus === 'Pending');
  protected readonly title = computed(() => this.post().caption?.trim() || this.post().gameName || 'Clip');
  protected readonly initial = computed(() => this.post().username.charAt(0).toUpperCase());
  protected readonly timeAgo = computed(() => formatTimeAgo(this.post().createdAt));
  protected readonly commentTotal = computed(() => this.commentCount() ?? this.post().commentCount);

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

  constructor() {
    // A new clip in the same stage (Clips page queue) restarts from zero, and
    // autoplays when the queue asked for it. play() is deferred to
    // loadedmetadata: calling it while the element is still switching sources
    // is aborted by the browser, which is why the queue used to land paused.
    effect(() => {
      const src = this.src();
      this.currentTime.set(0);
      this.bufferedEnd.set(0);
      this.loadedDuration.set(0);
      this.pendingPlay.set(Boolean(src) && this.autoplay());
    });
  }

  togglePlay(): void {
    const video = this.videoRef().nativeElement;
    if (video.paused) {
      void video.play().catch(() => void 0);
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

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => void 0);
    } else {
      void this.stageRef().nativeElement.requestFullscreen().catch(() => void 0);
    }
  }

  protected syncFullscreen(): void {
    this.isFullscreen.set(document.fullscreenElement === this.stageRef().nativeElement);
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

  // ─── Media element events ──────────────────────────────────────────────
  protected onLoadedMetadata(): void {
    const video = this.videoRef().nativeElement;
    this.loadedDuration.set(Number.isFinite(video.duration) ? video.duration : 0);
    video.playbackRate = this.speed();
    video.volume = this.volume();
    if (this.pendingPlay()) {
      this.pendingPlay.set(false);
      void video.play().catch(() => void 0);
    }
  }

  protected onTimeUpdate(): void {
    if (!this.scrubbing()) {
      this.currentTime.set(this.videoRef().nativeElement.currentTime);
    }
  }

  protected onProgress(): void {
    const video = this.videoRef().nativeElement;
    if (video.buffered.length > 0) {
      this.bufferedEnd.set(video.buffered.end(video.buffered.length - 1));
    }
  }

  protected onEnded(): void {
    this.playing.set(false);
    this.ended.emit();
  }

  // ─── Scrub + volume bars ───────────────────────────────────────────────
  // Both bars are the design's own <div> tracks rather than <input type=range>:
  // the design draws a buffered range, a hover bubble and a knob that a native
  // range input can't express, and pointer capture gives the same drag feel.

  protected onScrubDown(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    this.scrubbing.set(true);
    this.seekTo(this.ratioFrom(track, event.clientX));
  }

  protected onScrubMove(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    const ratio = this.ratioFrom(track, event.clientX);
    this.hoverRatio.set(ratio);
    if (this.scrubbing()) {
      this.seekTo(ratio);
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

  private setVolume(ratio: number): void {
    const value = Math.min(1, Math.max(0, ratio));
    this.volume.set(value);
    this.muted.set(value === 0);
    this.videoRef().nativeElement.volume = value;
  }

  private seekTo(ratio: number): void {
    const duration = this.duration();
    if (duration <= 0) {
      return;
    }
    const time = ratio * duration;
    this.currentTime.set(time);
    this.videoRef().nativeElement.currentTime = time;
  }

  private ratioFrom(element: HTMLElement, clientX: number): number {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }
}
