import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BottomSheet } from '../../shared/bottom-sheet/bottom-sheet';
import { Observable, Subscription, catchError, finalize, of, switchMap } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { GameLookup } from '../../services/game/game-lookup.service';
import { SquadService } from '../../services/squad/squad.service';
import { NotificationService } from '../../services/notification/notification.service';
import { MeService } from '../../services/me/me.service';
import { PostModel } from '../../models/post.model';
import { SquadModel } from '../../models/squad.model';
import { PagedResult } from '../../models/paged-result.model';
import { PostComposer } from './post-composer/post-composer';
import { LoadError } from '../../shared/load-error/load-error';
import { PostCard } from './post-card/post-card';
import { FeedSidebar } from './feed-sidebar/feed-sidebar';
import { FeedRightRail } from './feed-right-rail/feed-right-rail';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const PAGE_SIZE = 10;

/** What the sidebar selected (via `?game=` / `?user=`); null = the default home feed. */
type FeedFilter = { kind: 'game'; gameId: number } | { kind: 'user'; userId: string } | null;

/**
 * Gamer Feed.dc.html `onFeed`: composer, the "CLIP OF THE DAY" hero, the
 * latest devlogs from games you follow, then a "From your games" rule and the
 * rest of your feed. Selecting a followed game/person in the sidebar narrows
 * the feed to it (the hero/devlog block is hidden while filtered).
 */
@Component({
  selector: 'app-feed',
  imports: [PostComposer, PostCard, FeedSidebar, FeedRightRail, LoadError, BottomSheet, RouterLink],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
})
export class Feed {
  private postService = inject(PostService);
  private gameLookup = inject(GameLookup);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  private meService = inject(MeService);
  private route = inject(ActivatedRoute);

  protected readonly filter = signal<FeedFilter>(null);
  protected readonly featured = signal<PostModel | null>(null);
  protected readonly devlogs = signal<PostModel[]>([]);
  protected readonly posts = signal<PostModel[]>([]);
  /** The filtered game's name for the rule label (resolved from the `?game=` id). */
  private readonly filterGameName = signal<string | null>(null);
  /** Fetched once here (not per-card) and passed down so PostCard can resolve a squad-tagged post's name client-side. */
  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** Phones / narrow windows: the hidden side column opened as a bottom sheet. */
  protected readonly mobilePanel = signal<'following' | 'progress' | null>(null);
  private postsRequest: Subscription | null = null;
  /** The default feed fell back to everyone's posts because you follow nothing yet. */
  protected readonly isDiscoverFallback = signal(false);

  /** Posts already shown above the rule never repeat below it. */
  private readonly pinnedIds = computed(() => {
    const ids = new Set(this.devlogs().map((p) => p.id));
    const hero = this.featured();
    if (hero) {
      ids.add(hero.id);
    }
    return ids;
  });

  protected readonly visiblePosts = computed(() => {
    const pinned = this.filter() ? new Set<string>() : this.pinnedIds();
    return this.posts().filter((p) => !pinned.has(p.id));
  });

  /** The rule's label: "From your games" by default, the selection's name when filtered. */
  protected readonly ruleLabel = computed(() => {
    const filter = this.filter();
    if (!filter) {
      return this.isDiscoverFallback() ? 'Discover' : 'From your games';
    }
    if (filter.kind === 'game') {
      return this.filterGameName() ?? 'Game';
    }
    return this.posts().find((p) => p.userId === filter.userId)?.username ?? 'Player';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.postsRequest?.unsubscribe());

    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((params) => {
      const game = Number(params.get('game'));
      const user = params.get('user');
      this.filter.set(game ? { kind: 'game', gameId: game } : user ? { kind: 'user', userId: user } : null);
      // Picking a game or player in the "Following" sheet filters the feed; the sheet has done its job.
      this.mobilePanel.set(null);
      this.resolveFilterGameName(game || null);
      this.posts.set([]);
      this.loadPosts(1);
    });

    this.loadFeatured();

    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  private resolveFilterGameName(gameId: number | null): void {
    this.filterGameName.set(gameId === null ? null : (this.gameLookup.get(gameId)?.name ?? null));
    if (gameId === null || this.filterGameName()) {
      return;
    }
    this.gameLookup.resolve(gameId).subscribe({
      next: (game) => {
        const filter = this.filter();
        if (filter?.kind === 'game' && filter.gameId === gameId) {
          this.filterGameName.set(game?.name ?? null);
        }
      },
      // The label falls back to "Game".
      error: () => void 0,
    });
  }

  onPosted(post: PostModel): void {
    if (!post.isDraft) {
      this.posts.update((existing) => [post, ...existing]);
    }
    // Creating a post can award XP and bump the streak — refresh live state.
    this.meService.refresh().subscribe({ error: () => void 0 });
  }

  loadMore(): void {
    this.loadPosts(this.page() + 1, true);
  }

  /**
   * "CLIP OF THE DAY" = today's hottest clip, falling back to the hottest clip
   * overall on a quiet day; plus the two newest devlogs from games you follow.
   */
  private loadFeatured(): void {
    this.postService
      .getPosts(1, 1, { postType: 'Clip', sort: 'hot', window: 'day' })
      .pipe(
        switchMap((today) => (today.items.length ? of(today) : this.postService.getPosts(1, 1, { postType: 'Clip', sort: 'hot' }))),
        catchError(() => of(null)),
      )
      .subscribe((result) => this.featured.set(result?.items[0] ?? null));

    this.postService
      .getPosts(1, 2, { postType: 'Devlog', followedGamesOnly: true, window: 'week' })
      .pipe(catchError(() => of(null)))
      .subscribe((result) => this.devlogs.set(result?.items ?? []));
  }

  private loadPosts(page: number, append = false): void {
    if (!append) {
      // Filter change / retry: a slower response (or "load more") for the previous filter must not land in this list.
      this.postsRequest?.unsubscribe();
      this.loadError.set(null);
    }
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    loadingSignal.set(true);
    this.postsRequest = this.request(page)
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: (err: unknown) => {
          if (append) {
            this.notificationService.error(extractApiErrorMessage(err, 'Failed to load feed.'));
          } else {
            // A failed first page must not read as "No posts yet".
            this.loadError.set('Error loading the feed.');
          }
        },
      });
  }

  protected retry(): void {
    this.loadPosts(1);
  }

  private request(page: number): Observable<PagedResult<PostModel>> {
    const filter = this.filter();
    if (filter?.kind === 'game') {
      return this.postService.getPosts(page, PAGE_SIZE, { gameId: filter.gameId });
    }
    if (filter?.kind === 'user') {
      return this.postService.getPosts(page, PAGE_SIZE, { userId: filter.userId });
    }
    if (page === 1) {
      this.isDiscoverFallback.set(false);
    }
    if (this.isDiscoverFallback()) {
      return this.postService.getPosts(page, PAGE_SIZE);
    }
    // Following nothing yet → show everyone's posts rather than an empty feed.
    return this.postService.getFollowingPosts(page, PAGE_SIZE).pipe(
      switchMap((result) => {
        if (page === 1 && result.items.length === 0) {
          this.isDiscoverFallback.set(true);
          return this.postService.getPosts(1, PAGE_SIZE);
        }
        return of(result);
      }),
    );
  }
}
