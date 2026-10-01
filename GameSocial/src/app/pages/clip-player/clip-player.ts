import { Component, DestroyRef, OnInit, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { ClipService } from '../../services/clip/clip.service';
import { FollowService } from '../../services/follow/follow.service';
import { LikeService } from '../../services/like/like.service';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PostModel } from '../../models/post.model';
import { PagedResult } from '../../models/paged-result.model';
import { HotMomentModel } from '../../models/clip.model';
import { ClipStage } from '../../shared/clip-stage/clip-stage';
import { shareClip } from '../../shared/clip-stage/clip-share';
import { ClipAutoplayService } from '../../shared/clip-autoplay.service';
import { clipVideo, formatAgoLong, formatClock, formatCount, formatViews } from '../../shared/clip-format';
import { ClipRailComments } from '../clips/clip-rail-comments/clip-rail-comments';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

type QueueSource = 'hot' | 'following' | 'new';

const SOURCE_LABELS: Record<QueueSource, string> = { hot: 'Hot today', following: 'Following', new: 'New' };
const QUEUE_SIZE = 12;

/**
 * Clip Player.dc.html — `/clips/:id`. The full 16:9 player (vertical 9:16 on
 * phones), the "Hot moments" chip row, title + "views · age · [tags]" meta,
 * the author card (Follow, ▲ fire, Comment, ↗ share, ◷ watch later) and the
 * 322px queue ("Playing from Hot today · 1 / 5" + Autoplay).
 *
 * `?from=hot|following|new` picks the queue (default Hot today); `?t=` starts
 * at a position.
 */
@Component({
  selector: 'app-clip-player',
  imports: [ImgFallback, ClipStage, ClipRailComments, RouterLink],
  templateUrl: './clip-player.html',
  styleUrl: './clip-player.scss',
})
export class ClipPlayer implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private postService = inject(PostService);
  private clipService = inject(ClipService);
  private followService = inject(FollowService);
  private likeService = inject(LikeService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private clipAutoplay = inject(ClipAutoplayService);
  private destroyRef = inject(DestroyRef);

  private readonly stage = viewChild(ClipStage);

  protected readonly post = signal<PostModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly queue = signal<PostModel[]>([]);
  protected readonly source = signal<QueueSource>('hot');
  protected readonly sourceLabel = signal(SOURCE_LABELS.hot);
  protected readonly hotMoments = signal<HotMomentModel[]>([]);
  protected readonly startAt = signal<number | null>(null);
  protected readonly time = signal(0);
  protected readonly theater = signal(false);
  protected readonly commentsOpen = signal(false);
  protected readonly isMobile = signal(false);
  /**
   * The 9:16 "vertical clip" layout only fits clips that are actually portrait — a 16:9 clip in it
   * lost half the picture and the control row. Landscape clips keep the full player on phones too.
   */
  protected readonly useVerticalStage = computed(() => {
    const post = this.post();
    const video = post ? clipVideo(post.media) : undefined;
    return this.isMobile() && !!video?.width && !!video?.height && video.height > video.width;
  });
  protected readonly autoplay = this.clipAutoplay.autoplay;
  protected readonly isTogglingFollow = signal(false);
  protected readonly isTogglingLike = signal(false);
  protected readonly isTogglingSave = signal(false);
  protected readonly commentDelta = signal(0);

  protected readonly following = linkedSignal(() => this.post()?.isAuthorFollowedByCurrentUser ?? false);
  protected readonly followerCount = linkedSignal(() => this.post()?.authorFollowerCount ?? 0);
  protected readonly liked = linkedSignal(() => this.post()?.isLikedByCurrentUser ?? false);
  protected readonly likeCount = linkedSignal(() => this.post()?.likeCount ?? 0);
  protected readonly saved = linkedSignal(() => this.post()?.isSavedByCurrentUser ?? false);

  protected readonly index = computed(() => this.queue().findIndex((p) => p.id === this.post()?.id));
  protected readonly positionLabel = computed(() => `${Math.max(0, this.index()) + 1} / ${Math.max(1, this.queue().length)}`);
  protected readonly prevPost = computed(() => (this.index() > 0 ? this.queue()[this.index() - 1] : null));
  protected readonly nextPost = computed(() => {
    const i = this.index();
    return i >= 0 && i + 1 < this.queue().length ? this.queue()[i + 1] : null;
  });
  protected readonly isOwn = computed(() => this.post()?.userId === this.authService.currentUser()?.id);
  protected readonly title = computed(() => this.post()?.caption?.trim() || this.post()?.gameName || 'Clip');
  protected readonly metaViews = computed(() => formatViews(this.post()?.viewCount));
  protected readonly metaAgo = computed(() => (this.post() ? formatAgoLong(this.post()!.createdAt) : ''));
  protected readonly metaChip = computed(() => {
    const p = this.post();
    if (!p) {
      return '';
    }
    return [p.gameName, ...(p.tags ?? [])].filter(Boolean).join(' · ');
  });
  protected readonly followersLabel = computed(() => `${formatCount(this.followerCount())} followers`);
  protected readonly likeLabel = computed(() => formatCount(this.likeCount()));
  protected readonly commentTotal = computed(() => (this.post()?.commentCount ?? 0) + this.commentDelta());
  protected readonly rankLabel = computed(() => (this.source() === 'hot' && this.index() >= 0 ? 'HOT TODAY' : 'CLIP'));

  ngOnInit(): void {
    const media = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px)') : null;
    if (media) {
      this.isMobile.set(media.matches);
      const onChange = (event: MediaQueryListEvent) => this.isMobile.set(event.matches);
      media.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
    }

    const from = this.route.snapshot.queryParamMap.get('from') as QueueSource | null;
    if (from && from in SOURCE_LABELS) {
      this.source.set(from);
      this.sourceLabel.set(SOURCE_LABELS[from]);
    }

    const sub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.open(id);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private open(id: string): void {
    this.commentDelta.set(0);
    this.hotMoments.set([]);
    const t = Number(this.route.snapshot.queryParamMap.get('t'));
    this.startAt.set(Number.isFinite(t) && t > 0 ? t : null);

    const known = this.queue().find((p) => p.id === id);
    if (known) {
      this.post.set(known);
      this.isLoading.set(false);
    }

    this.postService
      .getPost(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (post) => {
          this.notFound.set(false);
          this.post.set(post);
          this.queue.update((queue) => (queue.some((p) => p.id === post.id) ? queue.map((p) => (p.id === post.id ? post : p)) : queue));
          if (this.queue().length === 0) {
            this.loadQueue(post);
          } else if (!this.queue().some((p) => p.id === post.id)) {
            this.queue.update((queue) => [post, ...queue]);
          }
        },
        error: () => {
          if (!this.post()) {
            this.notFound.set(true);
          }
        },
      });

    this.clipService.getHotMoments(id).subscribe({
      next: (moments) => {
        if (this.post()?.id === id || !this.post()) {
          this.hotMoments.set(moments);
        }
      },
      error: () => void 0,
    });
  }

  private queueRequest(): Observable<PagedResult<PostModel>> {
    switch (this.source()) {
      case 'following':
        return this.postService.getFollowingPosts(1, QUEUE_SIZE, 'Clip');
      case 'new':
        return this.postService.getPosts(1, QUEUE_SIZE, { postType: 'Clip', sort: 'new' });
      default:
        return this.postService.getPosts(1, QUEUE_SIZE, { postType: 'Clip', sort: 'hot', window: 'day' });
    }
  }

  private loadQueue(current: PostModel): void {
    this.queueRequest().subscribe({
      next: (result) => {
        const items = result.items;
        this.queue.set(items.some((p) => p.id === current.id) ? items : [current, ...items]);
      },
      error: () => this.queue.set([current]),
    });
  }

  // ─── Queue navigation ──────────────────────────────────────────────────
  protected go(post: PostModel | null): void {
    if (!post) {
      return;
    }
    void this.router.navigate(['/clips', post.id], { queryParams: { from: this.source() }, replaceUrl: false });
  }

  protected onEnded(): void {
    if (this.autoplay()) {
      this.go(this.nextPost());
    }
  }

  protected toggleAutoplay(): void {
    this.clipAutoplay.setAutoplay(!this.autoplay());
  }

  protected seek(seconds: number): void {
    this.stage()?.seekTo(seconds);
  }

  protected momentClock(seconds: number): string {
    return formatClock(seconds);
  }

  protected duration(post: PostModel): string {
    return formatClock(clipVideo(post.media)?.durationSeconds ?? 0);
  }

  protected thumb(post: PostModel): string | null {
    return clipVideo(post.media)?.thumbnailUrl ?? null;
  }

  protected thumbVideo(post: PostModel): string {
    const media = clipVideo(post.media);
    return media?.renditions?.at(-1)?.url ?? media?.url ?? '';
  }

  protected queueTitle(post: PostModel): string {
    return post.caption?.trim() || post.gameName || 'Clip';
  }

  protected queueMeta(post: PostModel): string {
    return `${post.username} · ${formatViews(post.viewCount)}`;
  }

  // ─── Author card actions ───────────────────────────────────────────────
  protected toggleFollow(): void {
    const post = this.post();
    if (!post || this.isTogglingFollow()) {
      return;
    }
    this.isTogglingFollow.set(true);
    this.followService
      .toggleUserFollow(post.userId)
      .pipe(finalize(() => this.isTogglingFollow.set(false)))
      .subscribe({
        next: (result) => {
          if (result.following !== this.following()) {
            this.followerCount.update((n) => Math.max(0, n + (result.following ? 1 : -1)));
          }
          this.following.set(result.following);
        },
        error: () => this.notificationService.error('Takip güncellenemedi.'),
      });
  }

  protected toggleLike(): void {
    const post = this.post();
    if (!post || this.isTogglingLike()) {
      return;
    }
    this.isTogglingLike.set(true);
    this.likeService
      .toggleLike(post.id)
      .pipe(finalize(() => this.isTogglingLike.set(false)))
      .subscribe({
        next: (result) => {
          this.liked.set(result.liked);
          this.likeCount.set(result.likeCount);
        },
        error: () => this.notificationService.error('Failed to update like. Please try again.'),
      });
  }

  protected toggleSave(): void {
    const post = this.post();
    if (!post || this.isTogglingSave()) {
      return;
    }
    this.isTogglingSave.set(true);
    this.postService
      .toggleSave(post.id)
      .pipe(finalize(() => this.isTogglingSave.set(false)))
      .subscribe({
        next: (result) => {
          this.saved.set(result.saved);
          this.notificationService.success(result.saved ? 'Sonra izle listesine eklendi.' : 'Sonra izle listesinden çıkarıldı.');
        },
        error: () => this.notificationService.error('Kaydetme başarısız oldu.'),
      });
  }

  protected async share(): Promise<void> {
    const post = this.post();
    if (!post) {
      return;
    }
    const message = await shareClip(post);
    if (message) {
      this.notificationService.success(message);
    }
  }

  protected toggleComments(): void {
    this.commentsOpen.update((open) => !open);
  }
}
