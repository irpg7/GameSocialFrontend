import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { PostListFilters, PostService } from '../../services/post/post.service';
import { GameService } from '../../services/game/game.service';
import { ReviewService } from '../../services/review/review.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { XpAwardsService } from '../../services/config/xp-awards.service';
import { PostModel } from '../../models/post.model';
import { GAME_GENRES, GameModel } from '../../models/game.model';
import { ReviewSummaryModel, ReviewWaitingGameModel, TrustedReviewerModel } from '../../models/review.model';
import { ReviewSheet } from '../../shared/review-sheet/review-sheet';
import { formatTimeAgo } from '../../shared/clip-format';
import { ReviewCard } from './review-card/review-card';

const PAGE_SIZE = 10;
const LONG_PLAYTIME_HOURS = 20;

/** "Games you play" / "Following" narrow whose reviews you see; exclusive, like the design's first chip group. */
type ReviewScope = 'games' | 'following' | null;

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
  imports: [ReviewCard, ReviewSheet],
  templateUrl: './reviews.html',
  styleUrl: './reviews.scss',
})
export class Reviews implements OnInit {
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private reviewService = inject(ReviewService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private xpAwards = inject(XpAwardsService);
  private route = inject(ActivatedRoute);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly posts = signal<PostModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);

  protected readonly scope = signal<ReviewScope>('games');
  protected readonly newest = signal(false);
  protected readonly longPlaytimeOnly = signal(false);
  protected readonly noSpoilers = signal(false);
  /** `?game=` deep link (shared review links, game pages). */
  protected readonly gameFilter = signal<number | null>(null);

  protected readonly summary = signal<ReviewSummaryModel | null>(null);
  protected readonly waitingGames = signal<ReviewWaitingGameModel[]>([]);
  protected readonly trustedReviewers = signal<TrustedReviewerModel[]>([]);

  protected readonly isReviewSheetOpen = signal(false);
  protected readonly preselectedGameId = signal<number | null>(null);

  protected readonly reviewXp = computed(() => this.xpAwards.amount('review'));
  protected readonly sectionLabel = computed(() => (this.newest() ? 'Newest reviews' : 'Most useful this week'));
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
      this.scope.set(null);
    }

    this.loadPosts(1);
    this.loadSummary();
    this.loadWaiting();

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });

    this.reviewService.getTrustedReviewers(1, 3).subscribe({
      next: (result) => this.trustedReviewers.set(result.items),
      error: () => void 0,
    });
  }

  setScope(scope: Exclude<ReviewScope, null>): void {
    this.scope.update((current) => (current === scope ? null : scope));
    this.reload();
  }

  toggleNewest(): void {
    this.newest.update((v) => !v);
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
      error: () => this.notificationService.error('Failed to update follow status.'),
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
    const scope = this.scope();
    return {
      postType: 'Review',
      gameId: this.gameFilter() ?? undefined,
      sort: this.newest() ? 'new' : 'useful',
      window: this.newest() ? undefined : 'week',
      followedGamesOnly: scope === 'games',
      followingOnly: scope === 'following',
      minHoursPlayed: this.longPlaytimeOnly() ? LONG_PLAYTIME_HOURS : undefined,
      spoilerFreeOnly: this.noSpoilers(),
    };
  }

  private loadSummary(): void {
    this.reviewService.getSummary(this.gameFilter()).subscribe({
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

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    loadingSignal.set(true);
    this.postService
      .getPosts(page, PAGE_SIZE, this.filters())
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load reviews.'),
      });
  }
}
