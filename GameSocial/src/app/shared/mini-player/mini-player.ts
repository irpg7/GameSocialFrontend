import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { PlayerStateService } from './player-state.service';
import { clipVideo, formatClock } from '../clip-format';

/**
 * Clip Player.dc.html "Mini player pinned while browsing": a 276px card in
 * the bottom-right corner that keeps the clip you left playing — ⏮ ▶ ⏭ in
 * the middle, ⤢ (back to the Clip Player) and ✕ in the corner, a 3px
 * progress line, then the title and "author · next in 0:24".
 * Hidden on the Clips page and the Clip Player, which own playback there.
 */
@Component({
  selector: 'app-mini-player',
  templateUrl: './mini-player.html',
  styleUrl: './mini-player.scss',
})
export class MiniPlayer {
  private state = inject(PlayerStateService);
  private router = inject(Router);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly pinned = this.state.pinned;
  protected readonly visible = computed(() => this.pinned() !== null && !/^\/clips(\/|\?|$)/.test(this.url()));
  protected readonly post = computed(() => this.pinned()?.post ?? null);
  private readonly postId = computed(() => this.post()?.id ?? null);
  protected readonly src = computed(() => {
    const media = this.post() ? clipVideo(this.post()!.media) : undefined;
    return media?.url ?? '';
  });
  protected readonly poster = computed(() => (this.post() ? (clipVideo(this.post()!.media)?.thumbnailUrl ?? null) : null));
  protected readonly title = computed(() => this.post()?.caption?.trim() || this.post()?.gameName || 'Clip');
  protected readonly hasNext = computed(() => this.state.next() !== null);
  protected readonly hasPrev = computed(() => this.state.previous() !== null);

  protected readonly playing = signal(false);
  protected readonly time = signal(0);
  protected readonly duration = signal(0);
  protected readonly progress = computed(() => (this.duration() > 0 ? Math.min(100, (this.time() / this.duration()) * 100) : 0));
  protected readonly metaLine = computed(() => {
    const author = this.post()?.username ?? '';
    const left = formatClock(Math.max(0, this.duration() - this.time()));
    return this.hasNext() && this.state.autoplay() ? `${author} · next in ${left}` : `${author} · ${left} left`;
  });

  private startAt = 0;

  constructor() {
    // A new pinned clip (or ⏮/⏭) restarts the element at the pinned position.
    effect(() => {
      this.postId();
      untracked(() => {
        this.startAt = this.pinned()?.time ?? 0;
        this.time.set(this.startAt);
        this.duration.set(0);
      });
    });
  }

  protected onLoadedMetadata(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
    video.currentTime = this.startAt;
    video.play().catch(() => {
      // Autoplay with sound can be refused without a fresh gesture — keep going muted.
      video.muted = true;
      void video.play().catch(() => void 0);
    });
  }

  protected onTimeUpdate(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    this.time.set(video.currentTime);
    this.state.updateTime(video.currentTime);
  }

  protected onEnded(): void {
    this.playing.set(false);
    if (this.state.autoplay() && this.hasNext()) {
      this.state.step(1);
    }
  }

  protected togglePlay(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => void 0);
    } else {
      video.pause();
    }
  }

  protected step(direction: 1 | -1): void {
    this.state.step(direction);
  }

  protected expand(): void {
    const post = this.post();
    if (post) {
      void this.router.navigate(['/clips', post.id]);
    }
  }

  protected close(): void {
    this.videoRef()?.nativeElement.pause();
    this.state.dismiss();
  }
}
