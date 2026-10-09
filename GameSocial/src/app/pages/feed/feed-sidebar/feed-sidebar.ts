import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FollowService } from '../../../services/follow/follow.service';
import { SquadService } from '../../../services/squad/squad.service';
import { MeService } from '../../../services/me/me.service';
import { GameService } from '../../../services/game/game.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { FollowedGameModel, FollowedUserModel } from '../../../models/follow.model';
import { GameModel } from '../../../models/game.model';
import { PagedResult } from '../../../models/paged-result.model';
import { SquadModel } from '../../../models/squad.model';
import { SquadCreateSheet } from '../../../shared/squad-create-sheet/squad-create-sheet';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { extractApiErrorMessage } from '../../../shared/api-error.util';

type FollowTab = 'games' | 'people';

const SUGGESTED_GAMES = 5;
const FOLLOW_PAGE_SIZE = 50;
const FILTER_DEBOUNCE_MS = 250;

/**
 * Feed-page-only left rail (Gamer Feed.dc.html `aside` 212px): what you
 * follow (Games/People tabs with a filter and red "new posts" markers), your
 * squads (red unread dot), and the streak card pinned to the bottom.
 *
 * Selecting a row narrows the feed to it through `?game=` / `?user=` (the Feed
 * page reads the query param) and marks it seen, clearing its marker.
 * Selecting the active row again clears the filter.
 *
 * Both lists are paged (first 50, "Show more" for the rest). The filter narrows what is loaded; while
 * a list has more pages it also asks the server (`search=`) so matches beyond the loaded page show up.
 */
@Component({
  selector: 'app-feed-sidebar',
  imports: [ImgFallback, RouterLink, SquadCreateSheet],
  templateUrl: './feed-sidebar.html',
  styleUrl: './feed-sidebar.scss',
})
export class FeedSidebar {
  private followService = inject(FollowService);
  private squadService = inject(SquadService);
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected readonly meService = inject(MeService);

  protected readonly activeTab = signal<FollowTab>('games');
  protected readonly filterQuery = signal('');
  protected readonly isCreateSheetOpen = signal(false);

  protected readonly followedGames = signal<FollowedGameModel[]>([]);
  protected readonly followedUsers = signal<FollowedUserModel[]>([]);
  protected readonly gamesTotal = signal(0);
  protected readonly peopleTotal = signal(0);
  protected readonly gamesHasMore = signal(false);
  protected readonly peopleHasMore = signal(false);
  protected readonly isLoadingMoreFollows = signal(false);
  private gamesPage = 1;
  private peoplePage = 1;
  /** Server matches for the filter while a list has unloaded pages (null = use the loaded rows). */
  private readonly gameMatches = signal<FollowedGameModel[] | null>(null);
  private readonly peopleMatches = signal<FollowedUserModel[] | null>(null);
  protected readonly mySquads = signal<SquadModel[]>([]);
  /** A failed list says so (with a retry) instead of looking like "you follow nothing". */
  protected readonly gamesFailed = signal(false);
  protected readonly peopleFailed = signal(false);
  protected readonly squadsFailed = signal(false);

  /** "Follow one" suggestions shown while you follow no games (a few catalogue games, filtered on the server). */
  protected readonly suggestedGames = signal<GameModel[]>([]);
  protected readonly followBusyId = signal<number | null>(null);

  protected readonly selectedGameId = signal<number | null>(null);
  protected readonly selectedUserId = signal<string | null>(null);

  protected readonly filteredGames = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const games = this.followedGames();
    if (!query) {
      return games;
    }
    return this.gameMatches() ?? games.filter((g) => g.name.toLowerCase().includes(query));
  });

  protected readonly filteredPeople = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const people = this.followedUsers();
    if (!query) {
      return people;
    }
    return this.peopleMatches() ?? people.filter((u) => u.username.toLowerCase().includes(query));
  });

  /** "Show more" only makes sense on the unfiltered list. */
  protected readonly canShowMore = computed(
    () => !this.filterQuery().trim() && (this.activeTab() === 'games' ? this.gamesHasMore() : this.peopleHasMore()),
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const game = Number(params.get('game'));
      const user = params.get('user');
      this.selectedGameId.set(game || null);
      this.selectedUserId.set(user);
      if (user) {
        this.activeTab.set('people');
      } else if (game) {
        this.activeTab.set('games');
      }
    });

    this.loadGames();
    this.loadPeople();
    this.loadSquads();

    toObservable(this.filterQuery)
      .pipe(
        map((q) => q.trim()),
        debounceTime(FILTER_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.searchBeyondLoaded(query)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected loadGames(): void {
    this.gamesFailed.set(false);
    this.followService.getFollowedGames({ pageSize: FOLLOW_PAGE_SIZE }).subscribe({
      next: (page) => {
        this.applyGamesPage(page, true);
        if (page.totalCount === 0) {
          this.loadSuggestions(this.filterQuery().trim());
        }
      },
      error: () => this.gamesFailed.set(true),
    });
  }

  protected loadPeople(): void {
    this.peopleFailed.set(false);
    this.followService.getFollowedUsers({ pageSize: FOLLOW_PAGE_SIZE }).subscribe({
      next: (page) => this.applyPeoplePage(page, true),
      error: () => this.peopleFailed.set(true),
    });
  }

  protected showMore(): void {
    if (this.isLoadingMoreFollows()) {
      return;
    }
    this.isLoadingMoreFollows.set(true);
    const done = () => this.isLoadingMoreFollows.set(false);
    const failed = (err: unknown) => {
      done();
      this.notificationService.error(extractApiErrorMessage(err, 'Could not load more.'));
    };
    if (this.activeTab() === 'games') {
      this.followService.getFollowedGames({ page: this.gamesPage + 1, pageSize: FOLLOW_PAGE_SIZE }).subscribe({
        next: (page) => {
          this.applyGamesPage(page, false);
          done();
        },
        error: failed,
      });
    } else {
      this.followService.getFollowedUsers({ page: this.peoplePage + 1, pageSize: FOLLOW_PAGE_SIZE }).subscribe({
        next: (page) => {
          this.applyPeoplePage(page, false);
          done();
        },
        error: failed,
      });
    }
  }

  private applyGamesPage(page: PagedResult<FollowedGameModel>, reset: boolean): void {
    this.followedGames.update((games) => (reset ? page.items : [...games, ...page.items]));
    this.gamesPage = page.page;
    this.gamesTotal.set(page.totalCount);
    this.gamesHasMore.set(page.hasMore);
  }

  private applyPeoplePage(page: PagedResult<FollowedUserModel>, reset: boolean): void {
    this.followedUsers.update((users) => (reset ? page.items : [...users, ...page.items]));
    this.peoplePage = page.page;
    this.peopleTotal.set(page.totalCount);
    this.peopleHasMore.set(page.hasMore);
  }

  /** Server-side filter for lists with unloaded pages, and for the "follow one" suggestions. */
  private searchBeyondLoaded(query: string): Observable<unknown> {
    this.gameMatches.set(null);
    this.peopleMatches.set(null);
    if (this.gamesTotal() === 0 && !this.gamesFailed()) {
      this.loadSuggestions(query);
    }
    if (!query) {
      return of(null);
    }
    // A failed request falls back to filtering the loaded rows.
    const games$ = this.gamesHasMore()
      ? this.followService.getFollowedGames({ search: query, pageSize: FOLLOW_PAGE_SIZE }).pipe(
          map((page) => this.gameMatches.set(page.items)),
          catchError(() => of(null)),
        )
      : of(null);
    const people$ = this.peopleHasMore()
      ? this.followService.getFollowedUsers({ search: query, pageSize: FOLLOW_PAGE_SIZE }).pipe(
          map((page) => this.peopleMatches.set(page.items)),
          catchError(() => of(null)),
        )
      : of(null);
    return games$.pipe(switchMap(() => people$));
  }

  private loadSuggestions(query: string): void {
    this.gameService.list({ search: query || undefined, pageSize: SUGGESTED_GAMES }).subscribe({
      next: (page) => this.suggestedGames.set(page.items),
      // Only feeds the "follow one" suggestions — the empty state still makes sense without them.
      error: () => void 0,
    });
  }

  selectTab(tab: FollowTab): void {
    this.activeTab.set(tab);
  }

  onFilterInput(value: string): void {
    this.filterQuery.set(value);
  }

  selectGame(game: FollowedGameModel): void {
    if (this.selectedGameId() === game.id) {
      void this.router.navigate(['/feed']);
      return;
    }
    void this.router.navigate(['/feed'], { queryParams: { game: game.id } });
    if (game.newPostCount > 0) {
      this.followedGames.update((games) => games.map((g) => (g.id === game.id ? { ...g, newPostCount: 0 } : g)));
      this.followService.markGameSeen(game.id).subscribe({ error: () => void 0 });
    }
  }

  followGame(game: GameModel): void {
    if (this.followBusyId() !== null) {
      return;
    }
    this.followBusyId.set(game.id);
    this.followService.toggleGameFollow(game.id).subscribe({
      next: (result) => {
        this.followBusyId.set(null);
        if (result.following) {
          this.followedGames.update((games) =>
            [...games.filter((g) => g.id !== game.id), { ...game, newPostCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.gamesTotal.update((total) => total + 1);
        }
      },
      error: (err: unknown) => {
        this.followBusyId.set(null);
        this.notificationService.error(extractApiErrorMessage(err, 'Failed to follow the game.'));
      },
    });
  }

  selectPerson(person: FollowedUserModel): void {
    if (this.selectedUserId() === person.userId) {
      void this.router.navigate(['/feed']);
      return;
    }
    void this.router.navigate(['/feed'], { queryParams: { user: person.userId } });
    if (person.newPostCount) {
      this.followedUsers.update((users) => users.map((u) => (u.userId === person.userId ? { ...u, newPostCount: 0 } : u)));
      this.followService.markUserSeen(person.userId).subscribe({ error: () => void 0 });
    }
  }

  hasUnread(squad: SquadModel): boolean {
    return (squad.unreadMessageCount ?? 0) + (squad.newClipCount ?? 0) > 0;
  }

  onSquadCreated(squad: SquadModel): void {
    this.isCreateSheetOpen.set(false);
    this.mySquads.update((squads) => [...squads, squad]);
    void this.router.navigate(['/squads', squad.id]);
  }

  protected loadSquads(): void {
    this.squadsFailed.set(false);
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => this.squadsFailed.set(true),
    });
  }
}
