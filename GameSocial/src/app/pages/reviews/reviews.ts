import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { PostListFilters, PostService } from '../../services/post/post.service';
import { ReviewService } from '../../services/review/review.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { XpAwardsService } from '../../services/config/xp-awards.service';
import { PostModel } from '../../models/post.model';
import { GAME_GENRES } from '../../models/game.model';
import { ReviewSummaryModel, ReviewWaitingGameModel, TrustedReviewerModel } from '../../models/review.model';
import { ReviewSheet } from '../../shared/review-sheet/review-sheet';
import { formatTimeAgo } from '../../shared/clip-format';
import { ReviewCard } from './review-card/review-card';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { LoadError } from '../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { AuthService } from '../../services/auth/auth.service';

const PAGE_SIZE = 10;
const LONG_PLAYTIME_HOURS = 20;

/**
 * The design's first chip group — exactly one is selected, like tabs.
 * "Games you play" / "Following" rank by usefulness this week; "Newest" is
 * every review, latest first.
 */
type ReviewTab = 'games' | 'following' | 'newest';

const REVIEW_TABS: { value: ReviewTab; label: string }[] = [
  { value: 'games', label: 'Games you play' },
  { value: 'following', label: 'Following' },
  { value: 'newest', label: 'Newest' },
];

/** Histogram bar tint per bucket (9-10 & 7-8 brand red, 5-6 #8a1a26, 1-4 #5c1219). */
const BUCKET_COLORS: Record<string, string> = {
  '9-10': '#E11D2E',
  '7-8': '#E11D2E',
  '5-6': '#8a1a26',
  '1-4': '#5c1219',
};

/**
 * Reviews page — design state `onReviews` (03-reviews.html). Every filter is a
 * server-side GET /api/posts param (sort=useful&window=week by default, i.e.
 * "Most useful this week"; "Newest" switches to sort=new). The summary card
 * comes from GET /api/reviews/summary: the `?game=` filtered game, else the
 * most-reviewed game you follow.
 */
@Component({
  selector: 'app-reviews',
  imports: [ImgFallback, ReviewCard, ReviewSheet, LoadError],
  templateUrl: './reviews.html',
  styleUrl: './reviews.scss',
})
export class Reviews implements OnInit {
  private postService = inject(PostService);
  private reviewService = inject(ReviewService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private xpAwards = inject(XpAwardsService);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  /** Trusted reviewers can include you; you get no Follow button on yourself. */
  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);

  protected readonly posts = signal<PostModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly tabs = REVIEW_TABS;
  protected readonly tab = signal<ReviewTab>('games');
  protected readonly longPlaytimeOnly = signal(false);
  protected readonly noSpoilers = signal(false);
  /** `?game=` deep link (shared review links, game pages). */
  protected readonly gameFilter = signal<number | null>(null);

  protected readonly summary = signal<ReviewSummaryModel | null>(null);
  protected readonly waitingGames = signal<ReviewWaitingGameModel[]>([]);
  protected readonly trustedReviewers = signal<TrustedReviewerModel[]>([]);

  /** The latest feed request — a tab/filter switch cancels it. */
  private feedRequest?: Subscription;
  private summaryRequest?: Subscription;

  protected readonly isReviewSheetOpen = signal(false);
  protected readonly preselectedGameId = signal<number | null>(null);

  protected readonly reviewXp = computed(() => this.xpAwards.amount('review'));
  protected readonly sectionLabel = computed(() => (this.tab() === 'newest' ? 'Newest reviews' : 'Most useful this week'));
  protected readonly bucketColors = BUCKET_COLORS;

  protected readonly summaryMeta = computed(() => {
    const s = this.summary();
    if (!s) {
      return '';
    }
    const genres = s.genres.map((g) => GAME_GENRES.find((x) => x.value === g)?.label ?? g).join(', ');
    return [s.studio, genres].filter((x) => !!x).join(' · ');
  });

  ngOnInit(): void {
    const game = Number(this.route.snapshot.queryParamMap.get('game'));
    if (Number.isInteger(game) && game > 0) {
      this.gameFilter.set(game);
      // One game's "most useful this week" is often empty — open on its newest reviews.
      this.tab.set('newest');
    }

    this.loadPosts(1);
    this.loadSummary();
    this.loadWaiting();

    this.reviewService.getTrustedReviewers(1, 3).subscribe({
      next: (result) => this.trustedReviewers.set(result.items),
      error: () => void 0,
    });
  }

  setTab(tab: ReviewTab): void {
    if (tab === this.tab()) {
      return;
    }
    this.tab.set(tab);
    this.reload();
  }

  toggleLongPlaytime(): void {
    this.longPlaytimeOnly.update((v) => !v);
    this.reload();
  }

  toggleNoSpoilers(): void {
    this.noSpoilers.update((v) => !v);
    this.reload();
  }

  clearGameFilter(): void {
    this.gameFilter.set(null);
    this.reload();
    this.loadSummary();
  }

  openReviewSheet(gameId: number | null = null): void {
    this.preselectedGameId.set(gameId);
    this.isReviewSheetOpen.set(true);
  }

  onReviewPosted(post: PostModel): void {
    this.isReviewSheetOpen.set(false);
    this.posts.update((existing) => [post, ...existing.filter((p) => p.id !== post.id)]);
    // May have cleared a "waiting" entry and moved the game's score.
    this.loadWaiting();
    this.loadSummary();
  }

  toggleFollowReviewer(reviewer: TrustedReviewerModel): void {
    this.followService.toggleUserFollow(reviewer.userId).subscribe({
      next: (result) => {
        this.trustedReviewers.update((list) =>
          list.map((r) => (r.userId === reviewer.userId ? { ...r, isFollowedByCurrentUser: result.following } : r)),
        );
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update follow status.')),
    });
  }

  loadMore(): void {
    this.loadPosts(this.page() + 1, true);
  }

  /** "28 h · finished 2 d ago" / "96 h · still playing" / "last post 3 d ago". */
  waitingMeta(game: ReviewWaitingGameModel): string {
    const ago = formatTimeAgo(game.lastActivityAt);
    const hours = game.hoursPlayed != null ? `${game.hoursPlayed} h · ` : '';
    switch (game.playStatus) {
      case 'Finished':
        return `${hours}finished ${ago}`;
      case 'StillPlaying':
        return `${hours}still playing`;
      case 'Dropped':
        return `${hours}dropped ${ago}`;
      default:
        return `${hours}last post ${ago}`;
    }
  }

  private reload(): void {
    this.loadPosts(1);
  }

  private filters(): PostListFilters {
    const tab = this.tab();
    const gameId = this.gameFilter() ?? undefined;
    return {
      postType: 'Review',
      gameId,
      sort: tab === 'newest' ? 'new' : 'useful',
      window: tab === 'newest' ? undefined : 'week',
      // A `?game=` filter already names the game, followed or not.
      followedGamesOnly: tab === 'games' && gameId === undefined,
      followingOnly: tab === 'following',
      minHoursPlayed: this.longPlaytimeOnly() ? LONG_PLAYTIME_HOURS : undefined,
      spoilerFreeOnly: this.noSpoilers(),
    };
  }

  private loadSummary(): void {
    // A quick ?game= change: the previous game's summary must not land on this one.
    this.summaryRequest?.unsubscribe();
    this.summaryRequest = this.reviewService.getSummary(this.gameFilter()).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  private loadWaiting(): void {
    this.reviewService.getWaiting().subscribe({
      next: (games) => this.waitingGames.set(games),
      error: () => void 0,
    });
  }

  protected retryLoad(): void {
    this.loadPosts(1);
  }

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    if (!append) {
      // A tab/filter switch: drop the old list and whatever request is still in flight for it,
      // so a slower earlier response can't land on top of the new tab.
      this.feedRequest?.unsubscribe();
      this.posts.set([]);
      this.hasMore.set(false);
      this.loadError.set(null);
    }
    loadingSignal.set(true);
    this.feedRequest = this.postService
      .getPosts(page, PAGE_SIZE, this.filters())
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: (err: unknown) => {
          if (append) {
            this.notificationService.error(extractApiErrorMessage(err, 'Failed to load reviews.'));
          } else {
            // A failed first page must not read as "No reviews match yet".
            this.loadError.set('Error loading reviews.');
          }
        },
      });
  }
}
