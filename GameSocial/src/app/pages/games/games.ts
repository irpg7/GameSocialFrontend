import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GameLookup } from '../../services/game/game-lookup.service';
import { GameModel } from '../../models/game.model';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { LoadError } from '../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 250;

@Component({
  selector: 'app-games',
  imports: [ImgFallback, LoadError],
  templateUrl: './games.html',
  styleUrl: './games.scss',
})
export class Games {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private gameLookup = inject(GameLookup);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly busyId = signal<number | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isLoadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** The query the shown results belong to (the box may already hold newer text). */
  protected readonly resultsQuery = signal('');
  protected readonly isEmpty = computed(() => this.games().length === 0);
  private readonly page = signal(1);
  private request?: Subscription;

  constructor() {
    // The catalogue is paged: searching asks the server instead of filtering the loaded page.
    toObservable(this.searchQuery)
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  protected load(): void {
    this.fetch(1);
  }

  protected loadMore(): void {
    if (!this.isLoadingMore() && this.hasMore()) {
      this.fetch(this.page() + 1);
    }
  }

  protected toggleFollow(game: GameModel): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(game.id);
    this.followService.toggleGameFollow(game.id).subscribe({
      next: (result) => {
        this.games.update((games) => games.map((g) => (g.id === game.id ? { ...g, isFollowed: result.following } : g)));
        this.busyId.set(null);
      },
      error: (err) => {
        this.busyId.set(null);
        this.notificationService.error(extractApiErrorMessage(err, 'Failed to update follow status.'));
      },
    });
  }

  private fetch(page: number): void {
    const first = page === 1;
    const query = this.searchQuery().trim();
    this.request?.unsubscribe();
    (first ? this.isLoading : this.isLoadingMore).set(true);
    if (first) {
      this.loadError.set(null);
    }
    this.request = this.gameService.list({ search: query || undefined, page, pageSize: PAGE_SIZE }).subscribe({
      next: (result) => {
        this.gameLookup.remember(result.items);
        this.games.update((games) => (first ? result.items : [...games, ...result.items]));
        this.page.set(page);
        this.hasMore.set(result.hasMore);
        this.resultsQuery.set(query);
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
        if (first) {
          this.loadError.set(extractApiErrorMessage(err, 'Could not load games.'));
        } else {
          this.notificationService.error(extractApiErrorMessage(err, 'Could not load more games.'));
        }
      },
    });
  }
}
