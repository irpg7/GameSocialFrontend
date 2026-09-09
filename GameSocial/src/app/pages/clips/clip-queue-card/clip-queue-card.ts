import { Component, ElementRef, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { PostModel } from '../../../models/post.model';
import { LikeService } from '../../../services/like/like.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { formatClock } from '../../../shared/clip-format';

/**
 * One card in the Clips page "Up next" rail, from Gamer Feed.dc.html's
 * `onClipsPage` state: thumbnail with a play badge, a duration chip, a hairline
 * progress line, then title, author and the vote/comment chips.
 *
 * The design's hover state ("ÖN İZLEME · 🔇") is a real muted preview here —
 * pointing at a card plays its video silently and the chip tracks the preview
 * position, exactly as the mock animates it. The design's save/bookmark glyph
 * is left out: the backend has no bookmark feature to bind it to.
 */
@Component({
  selector: 'app-clip-queue-card',
  templateUrl: './clip-queue-card.html',
  styleUrl: './clip-queue-card.scss',
  host: {
    class: 'clip-queue-card',
    '[class.is-active]': 'active()',
    '[class.is-previewing]': 'previewing()',
  },
})
export class ClipQueueCard {
  private likeService = inject(LikeService);
  private notificationService = inject(NotificationService);

  post = input.required<PostModel>();
  /** The clip currently loaded in the hero stage. */
  active = input(false);

  play = output<void>();
  openComments = output<void>();

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly previewing = signal(false);
  protected readonly previewTime = signal(0);
  protected readonly isTogglingLike = signal(false);
  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);

  protected readonly media = computed(() => this.post().media.find((m) => m.mediaType === 'Video'));
  protected readonly src = computed(() => this.media()?.url ?? '');
  protected readonly duration = computed(() => this.media()?.durationSeconds ?? 0);
  protected readonly title = computed(() => this.post().caption?.trim() || this.post().gameName || 'Clip');
  protected readonly initial = computed(() => this.post().username.charAt(0).toUpperCase());
  protected readonly timeLabel = computed(() => formatClock(this.previewing() ? this.previewTime() : this.duration()));
  protected readonly progressPercent = computed(() => {
    const total = this.duration();
    return this.previewing() && total > 0 ? Math.min(100, (this.previewTime() / total) * 100) : 0;
  });

  protected onEnter(): void {
    this.previewing.set(true);
    const video = this.videoRef().nativeElement;
    video.currentTime = 0;
    void video.play().catch(() => this.previewing.set(false));
  }

  protected onLeave(): void {
    this.previewing.set(false);
    this.previewTime.set(0);
    const video = this.videoRef().nativeElement;
    video.pause();
    video.currentTime = 0;
  }

  protected onPreviewTime(): void {
    if (this.previewing()) {
      this.previewTime.set(this.videoRef().nativeElement.currentTime);
    }
  }

  protected toggleLike(event: Event): void {
    event.stopPropagation();
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

  protected onOpenComments(event: Event): void {
    event.stopPropagation();
    this.openComments.emit();
  }
}
