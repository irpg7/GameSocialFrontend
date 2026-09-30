import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FollowService } from '../../../services/follow/follow.service';
import { SquadService } from '../../../services/squad/squad.service';
import { MeService } from '../../../services/me/me.service';
import { FollowedGameModel, FollowedUserModel } from '../../../models/follow.model';
import { SquadModel } from '../../../models/squad.model';
import { SquadCreateSheet } from '../../../shared/squad-create-sheet/squad-create-sheet';

type FollowTab = 'games' | 'people';

/**
 * Feed-page-only left rail (Gamer Feed.dc.html `aside` 212px): what you
 * follow (Games/People tabs with a filter and red "new posts" markers), your
 * squads (red unread dot), and the streak card pinned to the bottom.
 *
 * Selecting a row narrows the feed to it through `?game=` / `?user=` (the Feed
 * page reads the query param) and marks it seen, clearing its marker.
 * Selecting the active row again clears the filter.
 */
@Component({
  selector: 'app-feed-sidebar',
  imports: [RouterLink, SquadCreateSheet],
  templateUrl: './feed-sidebar.html',
  styleUrl: './feed-sidebar.scss',
})
export class FeedSidebar {
  private followService = inject(FollowService);
  private squadService = inject(SquadService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected readonly meService = inject(MeService);

  protected readonly activeTab = signal<FollowTab>('games');
  protected readonly filterQuery = signal('');
  protected readonly isCreateSheetOpen = signal(false);

  protected readonly followedGames = signal<FollowedGameModel[]>([]);
  protected readonly followedUsers = signal<FollowedUserModel[]>([]);
  protected readonly mySquads = signal<SquadModel[]>([]);

  protected readonly selectedGameId = signal<number | null>(null);
  protected readonly selectedUserId = signal<string | null>(null);

  protected readonly filteredGames = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const games = this.followedGames();
    return query ? games.filter((g) => g.name.toLowerCase().includes(query)) : games;
  });

  protected readonly filteredPeople = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const people = this.followedUsers();
    return query ? people.filter((u) => u.username.toLowerCase().includes(query)) : people;
  });

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

    this.followService.getFollowedGames().subscribe({
      next: (games) => this.followedGames.set(games),
      error: () => void 0,
    });
    this.followService.getFollowedUsers().subscribe({
      next: (users) => this.followedUsers.set(users),
      error: () => void 0,
    });
    this.loadSquads();
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

  private loadSquads(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }
}
