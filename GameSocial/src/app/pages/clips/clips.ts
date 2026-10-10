import { Component, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { LoadError } from '../../shared/load-error/load-error';
import { PostService } from '../../services/post/post.service';
import { ClipService } from '../../services/clip/clip.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PostModel } from '../../models/post.model';
import { PagedResult } from '../../models/paged-result.model';
import { HotMomentModel } from '../../models/clip.model';
import { ClipStage } from '../../shared/clip-stage/clip-stage';
import { ClipUploadSheet } from '../../shared/clip-upload-sheet/clip-upload-sheet';
import { ClipAutoplayService } from '../../shared/clip-autoplay.service';
import { ClipQueueCard } from './clip-queue-card/clip-queue-card';
import { ClipRailComments } from './clip-rail-comments/clip-rail-comments';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const PAGE_SIZE = 12;
/** How deep "#N TODAY" ranks — one request for the day's hot list. */
const RANK_DEPTH = 50;

export type ClipFilter = 'hot' | 'following' | 'new';
export type ClipRail = 'next' | 'comments';

const FILTER_LABELS: Record<ClipFilter, string> = { hot: 'Hot today', following: 'Following', new: 'New' };

/**
 * The Clips page from Gamer Feed.dc.html's `onClipsPage` state: heading and
 * "＋ Upload a clip" (opens the `sheetClip` sheet), "New / Following /
 * Hot today" chips with a count, then the hero player beside an "Up next" /
 * "Yorumlar" rail with an autoplay switch.
 *
 *  - Hot today = `GET posts?postType=Clip&sort=hot&window=day`; its total is
 *    the "4,182 clips today" line, and its order is the hero's "#N TODAY".
 *  - Following = `GET posts/following?postType=Clip`.
 *  - New = newest first ("Posted in the last hour" is the design's fixed copy).
 */
@Component({
  selector: 'app-clips',
  imports: [ClipStage, ClipQueueCard, ClipRailComments, ClipUploadSheet, LoadError],
  templateUrl: './clips.html',
  styleUrl: './clips.scss',
})
export class Clips implements OnInit {
  private postService = inject(PostService);
  private clipService = inject(ClipService);
  private notificationService = inject(NotificationService);
  private clipAutoplay = inject(ClipAutoplayService);
  private route = inject(ActivatedRoute);

  private readonly stage = viewChild(ClipStage);

  protected readonly posts = signal<PostModel[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);

  // New first: "Hot today" is empty on a quiet day, New always has the latest clips.
  protected readonly filter = signal<ClipFilter>('new');
  protected readonly rail = signal<ClipRail>('next');
  protected readonly autoplay = this.clipAutoplay.autoplay;
  protected readonly selectedClipId = signal<string | null>(null);
  protected readonly startAt = signal<number | null>(null);
  protected readonly heroTime = signal(0);
  protected readonly hotMoments = signal<HotMomentModel[]>([]);
  protected readonly isUploadOpen = signal(false);
  /** Today's hot ranking (post ids in order) — "#N TODAY". */
  private readonly hotRanking = signal<string[]>([]);
  /** A deep-linked clip that is not in the loaded page yet. */
  private readonly pinnedExtra = signal<PostModel | null>(null);
  /** While a deep-linked clip is being fetched the hero waits instead of flashing the first clip. */
  private readonly awaitingDeepLink = signal(false);
  /** Local comment-count deltas from the rail composer, keyed by post id. */
  protected readonly commentDeltas = signal<Record<string, number>>({});

  protected readonly filters: { key: ClipFilter; label: string }[] = (['new', 'following', 'hot'] as ClipFilter[]).map((key) => ({
    key,
    label: FILTER_LABELS[key],
  }));

  protected readonly clips = computed(() => {
    const list = this.posts();
    const extra = this.pinnedExtra();
    return extra && !list.some((p) => p.id === extra.id) ? [extra, ...list] : list;
  });

  protected readonly hero = computed(() => {
    const list = this.clips();
    const selectedId = this.selectedClipId();
    const selected = list.find((post) => post.id === selectedId);
    if (!selected && this.awaitingDeepLink()) {
      return null;
    }
    return selected ?? list[0] ?? null;
  });

  protected readonly upNext = computed(() => {
    const heroId = this.hero()?.id;
    return this.clips().filter((post) => post.id !== heroId);
  });

  protected readonly heroRank = computed(() => {
    const hero = this.hero();
    const index = hero ? this.hotRanking().indexOf(hero.id) : -1;
    return index >= 0 ? `#${index + 1} TODAY` : 'CLIP';
  });

  protected readonly heroCommentCount = computed(() => {
    const hero = this.hero();
    return hero ? hero.commentCount + (this.commentDeltas()[hero.id] ?? 0) : 0;
  });

  protected readonly countLabel = computed(() => {
    switch (this.filter()) {
      case 'hot':
        return `${this.totalCount().toLocaleString('en-US')} clips today`;
      case 'following':
        return `${this.totalCount().toLocaleString('en-US')} clips from people you follow`;
      default:
        return 'Posted in the last hour';
    }
  });

  constructor() {
    // Hot moments follow the hero.
    effect(() => {
      const id = this.hero()?.id;
      untracked(() => {
        this.hotMoments.set([]);
        if (id) {
          this.clipService.getHotMoments(id).subscribe({
            next: (moments) => {
              if (this.hero()?.id === id) {
                this.hotMoments.set(moments);
              }
            },
            error: () => void 0,
          });
        }
      });
    });
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const requested = params.get('clip');

    if (requested) {
      // The feed clip card's "Klip sayfasında aç" hands its post id over here.
      this.selectedClipId.set(requested);
      const t = Number(params.get('t'));
      this.startAt.set(Number.isFinite(t) && t > 0 ? t : null);
      this.awaitingDeepLink.set(true);
      this.postService
        .getPost(requested)
        .pipe(finalize(() => this.awaitingDeepLink.set(false)))
        .subscribe({
          next: (post) => this.pinnedExtra.set(post),
          error: () => this.startAt.set(null),
        });
    }
    if (params.get('rail') === 'comments') {
      this.rail.set('comments');
    }

    this.loadPosts(1);
    this.postService.getPosts(1, RANK_DEPTH, { postType: 'Clip', sort: 'hot', window: 'day' }).subscribe({
      next: (result) => this.hotRanking.set(result.items.map((p) => p.id)),
      error: () => void 0,
    });
  }

  setFilter(filter: ClipFilter): void {
    if (filter === this.filter()) {
      return;
    }
    this.filter.set(filter);
    this.selectedClipId.set(null);
    this.pinnedExtra.set(null);
    this.startAt.set(null);
    this.loadPosts(1);
  }

  setRail(rail: ClipRail): void {
    this.rail.set(rail);
  }

  toggleAutoplay(): void {
    this.clipAutoplay.setAutoplay(!this.autoplay());
  }

  selectClip(post: PostModel): void {
    this.startAt.set(null);
    this.selectedClipId.set(post.id);
  }

  openComments(post: PostModel): void {
    this.selectClip(post);
    this.rail.set('comments');
  }

  /** Autoplay moves to the clip after the current one, wrapping (the design's `nextId`). */
  onHeroEnded(): void {
    if (!this.autoplay()) {
      return;
    }
    const list = this.clips();
    const index = list.findIndex((p) => p.id === this.hero()?.id);
    const next = list.length > 1 ? list[(index + 1) % list.length] : null;
    if (next) {
      this.selectClip(next);
    }
  }

  onSeek(seconds: number): void {
    this.stage()?.seekTo(seconds);
  }

  onCommentCountChanged(postId: string, delta: number): void {
    this.commentDeltas.update((deltas) => ({ ...deltas, [postId]: (deltas[postId] ?? 0) + delta }));
  }

  openUpload(): void {
    this.isUploadOpen.set(true);
  }

  onUploaded(post: PostModel): void {
    if (post.isDraft) {
      return;
    }
    // Your new clip plays straight away (it is still being transcoded — "İŞLENİYOR").
    this.pinnedExtra.set(post);
    this.startAt.set(null);
    this.selectedClipId.set(post.id);
  }

  loadMore(): void {
    this.loadPosts(this.page() + 1, true);
  }

  private request(page: number): Observable<PagedResult<PostModel>> {
    switch (this.filter()) {
      case 'following':
        return this.postService.getFollowingPosts(page, PAGE_SIZE, 'Clip');
      case 'hot':
        return this.postService.getPosts(page, PAGE_SIZE, { postType: 'Clip', sort: 'hot', window: 'day' });
      default:
        return this.postService.getPosts(page, PAGE_SIZE, { postType: 'Clip', sort: 'new' });
    }
  }

  protected retryLoad(): void {
    this.loadPosts(1);
  }

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    const filter = this.filter();
    loadingSignal.set(true);
    if (!append) {
      this.posts.set([]);
      this.loadError.set(null);
    }
    this.request(page)
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          if (filter !== this.filter()) {
            return;
          }
          this.posts.update((existing) => (append ? [...existing, ...result.items.filter((p) => !existing.some((e) => e.id === p.id))] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
          this.totalCount.set(result.totalCount);
        },
        error: (err: unknown) => {
          if (filter !== this.filter()) {
            return;
          }
          if (append) {
            this.notificationService.error(extractApiErrorMessage(err, 'Klipler yüklenemedi.'));
          } else {
            // A failed first page must not read as "Henüz klip yok".
            this.loadError.set('Klipler yüklenemedi.');
          }
        },
      });
  }
}
