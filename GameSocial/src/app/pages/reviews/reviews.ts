import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { GameService } from '../../services/game/game.service';
import { ReviewService } from '../../services/review/review.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PostModel } from '../../models/post.model';
import { GameModel } from '../../models/game.model';
import { ReviewWaitingGameModel, TrustedReviewerModel } from '../../models/review.model';
import { PostCard } from '../feed/post-card/post-card';
import { ReviewSheet } from '../../shared/review-sheet/review-sheet';

const PAGE_SIZE = 10;

type ReviewFilter = 'following' | 'noSpoilers' | 'longPlaytime';

/**
 * Real Reviews page (Phase 3), replacing the Phase 1 placeholder.
 *
 * Scope cuts confirmed against the actual API surface (not silently faked):
 * - "Games you play" filter chip is omitted — there's no endpoint that
 *   returns "games I've posted about", and deriving it would need fetching
 *   every one of the user's own posts across all types just for this.
 * - The "Newest" chip is omitted as a control — GET /api/posts has no
 *   alternate sort order, newest-first is simply how it always returns
 *   results, so there's nothing to toggle.
 * - The featured aggregate-score card is omitted — there's no backend
 *   aggregate endpoint, and computing one from whatever page happens to be
 *   loaded client-side would silently mislabel a partial sample as "the"
 *   average.
 * - Dev-reply highlighting inside review comments is omitted — CommentModel
 *   doesn't carry the commenter's isDeveloper flag, so there's no way to
 *   detect it without a backend change.
 * - Reviewer level-per-card is omitted — PostModel only carries username/
 *   userId for the author, no level.
 */
@Component({
  selector: 'app-reviews',
  imports: [PostCard, ReviewSheet],
  templateUrl: './reviews.html',
  styleUrl: './reviews.scss',
})
export class Reviews implements OnInit {
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private reviewService = inject(ReviewService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly posts = signal<PostModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);

  protected readonly followedUserIds = signal<Set<string>>(new Set());
  protected readonly activeFilters = signal<Set<ReviewFilter>>(new Set());

  protected readonly waitingGames = signal<ReviewWaitingGameModel[]>([]);
  protected readonly trustedReviewers = signal<TrustedReviewerModel[]>([]);

  protected readonly isReviewSheetOpen = signal(false);
  protected readonly preselectedGameId = signal<number | null>(null);

  protected readonly filteredPosts = computed(() => {
    const filters = this.activeFilters();
    if (filters.size === 0) {
      return this.posts();
    }
    return this.posts().filter((post) => {
      if (filters.has('following') && !this.followedUserIds().has(post.userId)) {
        return false;
      }
      if (filters.has('noSpoilers') && post.review?.spoilerFree !== true) {
        return false;
      }
      if (filters.has('longPlaytime') && (post.review?.hoursPlayed ?? 0) < 20) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    this.loadPosts(1);

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });

    this.followService.getFollowedUsers().subscribe({
      next: (users) => this.followedUserIds.set(new Set(users.map((u) => u.userId))),
      error: () => void 0,
    });

    this.reviewService.getWaiting().subscribe({
      next: (games) => this.waitingGames.set(games),
      error: () => void 0,
    });

    this.reviewService.getTrustedReviewers().subscribe({
      next: (result) => this.trustedReviewers.set(result.items),
      error: () => void 0,
    });
  }

  toggleFilter(filter: ReviewFilter): void {
    this.activeFilters.update((filters) => {
      const next = new Set(filters);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }

  isFilterActive(filter: ReviewFilter): boolean {
    return this.activeFilters().has(filter);
  }

  openReviewSheet(gameId: number | null = null): void {
    this.preselectedGameId.set(gameId);
    this.isReviewSheetOpen.set(true);
  }

  onReviewPosted(post: PostModel): void {
    this.posts.update((existing) => [post, ...existing]);
    this.isReviewSheetOpen.set(false);
    // Re-check "waiting for your review" since this may have cleared one.
    this.reviewService.getWaiting().subscribe({
      next: (games) => this.waitingGames.set(games),
      error: () => void 0,
    });
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

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    loadingSignal.set(true);
    this.postService
      .getPosts(page, PAGE_SIZE, { postType: 'Review' })
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
