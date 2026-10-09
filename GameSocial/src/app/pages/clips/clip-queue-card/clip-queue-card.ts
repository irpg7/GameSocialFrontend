import { Component, ElementRef, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { PostModel } from '../../../models/post.model';
import { LikeService } from '../../../services/like/like.service';
import { PostService } from '../../../services/post/post.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { clipVideo, formatClock, formatCount } from '../../../shared/clip-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { extractApiErrorMessage } from '../../../shared/api-error.util';

/**
 * One card in the Clips page "Up next" rail, from Gamer Feed.dc.html's
 * `onClipsPage` state: poster thumbnail with a play badge, a duration chip, a
 * hairline progress line, then title, author + ◇/◆ save, and the vote/comment
 * chips.
 *
 * The design's hover state ("ÖN İZLEME · 🔇") is a real muted preview —
 * pointing at a card plays its video silently and the chip tracks the preview
 * position, exactly as the mock animates it. ◇/◆ is `POST posts/{id}/save`
 * (the same list as "◷ watch later" on the Clip Player).
 */
@Component({
  imports: [ImgFallback],
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
  private postService = inject(PostService);
  private notificationService = inject(NotificationService);

  post = input.required<PostModel>();
  /** The clip currently loaded in the hero stage. */
  active = input(false);
  /** Hero position while `active` (the design's card mirrors the hero's clock/progress). */
  activeTime = input(0);

  play = output<void>();
  openComments = output<void>();

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly previewing = signal(false);
  protected readonly previewTime = signal(0);
  protected readonly isTogglingLike = signal(false);
  protected readonly isTogglingSave = signal(false);
  protected readonly liked = linkedSignal(() => this.post().isLikedByCurrentUser);
  protected readonly likeCount = linkedSignal(() => this.post().likeCount);
  protected readonly saved = linkedSignal(() => this.post().isSavedByCurrentUser);

  protected readonly media = computed(() => clipVideo(this.post().media));
  protected readonly src = computed(() => this.media()?.renditions?.at(-1)?.url ?? this.media()?.url ?? '');
  protected readonly poster = computed(() => this.media()?.thumbnailUrl ?? null);
  protected readonly duration = computed(() => this.media()?.durationSeconds ?? 0);
  protected readonly title = computed(() => this.post().caption?.trim() || this.post().gameName || 'Clip');
  protected readonly initial = computed(() => this.post().username.charAt(0).toUpperCase());
  protected readonly likeLabel = computed(() => formatCount(this.likeCount()));
  protected readonly commentCount = computed(() => formatCount(this.post().commentCount));
  protected readonly timeLabel = computed(() => {
    if (this.previewing()) {
      return formatClock(this.previewTime());
    }
    return formatClock(this.active() ? this.activeTime() : this.duration());
  });
  protected readonly progressPercent = computed(() => {
    const total = this.duration();
    if (total <= 0) {
      return 0;
    }
    if (this.previewing()) {
      return Math.min(100, (this.previewTime() / total) * 100);
    }
    return this.active() ? Math.min(100, (this.activeTime() / total) * 100) : 0;
  });

  protected onPlay(event: Event): void {
    event.stopPropagation();
    this.play.emit();
  }

  protected onEnter(): void {
    if (this.active()) {
      return;
    }
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
      error: (err: unknown) => {
        this.isTogglingLike.set(false);
        this.notificationService.error(extractApiErrorMessage(err, 'Failed to update like. Please try again.'));
      },
    });
  }

  protected toggleSave(event: Event): void {
    event.stopPropagation();
    if (this.isTogglingSave()) {
      return;
    }
    this.isTogglingSave.set(true);
    this.postService.toggleSave(this.post().id).subscribe({
      next: (result) => {
        this.saved.set(result.saved);
        this.isTogglingSave.set(false);
      },
      error: (err: unknown) => {
        this.isTogglingSave.set(false);
        this.notificationService.error(extractApiErrorMessage(err, 'Kaydetme başarısız oldu.'));
      },
    });
  }

  protected onOpenComments(event: Event): void {
    event.stopPropagation();
    this.openComments.emit();
  }
}
