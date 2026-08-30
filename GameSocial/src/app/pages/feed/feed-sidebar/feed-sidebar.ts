import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameService } from '../../../services/game/game.service';
import { FollowService } from '../../../services/follow/follow.service';
import { SquadService } from '../../../services/squad/squad.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { GameModel } from '../../../models/game.model';
import { FollowedUserModel } from '../../../models/follow.model';
import { SquadModel } from '../../../models/squad.model';

type FollowTab = 'games' | 'people';

/**
 * Feed-page-only left rail: Follow (Games/People) tabs, Squads section,
 * streak card. Deliberately NOT part of MainLayout — see MainLayout's
 * doc comment for why this replaced the old global ProfilePanel.
 *
 * Games tab is real discovery (all games + follow toggle). People tab can
 * only show who you already follow — the backend has no "browse new people"
 * endpoint (see FollowService) — so there is no discovery affordance there,
 * by design, not by omission.
 */
@Component({
  selector: 'app-feed-sidebar',
  imports: [RouterLink, FormsModule],
  templateUrl: './feed-sidebar.html',
  styleUrl: './feed-sidebar.scss',
})
export class FeedSidebar implements OnInit {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  protected readonly meService = inject(MeService);

  protected readonly activeTab = signal<FollowTab>('games');
  protected readonly filterQuery = signal('');

  protected readonly games = signal<GameModel[]>([]);
  protected readonly followedGameIds = signal<Set<number>>(new Set());
  protected readonly followedUsers = signal<FollowedUserModel[]>([]);
  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly togglingGameId = signal<number | null>(null);

  protected readonly filteredGames = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const games = this.games();
    return query ? games.filter((g) => g.name.toLowerCase().includes(query)) : games;
  });

  protected readonly filteredPeople = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const people = this.followedUsers();
    return query ? people.filter((u) => u.username.toLowerCase().includes(query)) : people;
  });

  ngOnInit(): void {
    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
    this.followService.getFollowedGames().subscribe({
      next: (games) => this.followedGameIds.set(new Set(games.map((g) => g.id))),
      error: () => void 0,
    });
    this.followService.getFollowedUsers().subscribe({
      next: (users) => this.followedUsers.set(users),
      error: () => void 0,
    });
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  selectTab(tab: FollowTab): void {
    this.activeTab.set(tab);
  }

  isGameFollowed(gameId: number): boolean {
    return this.followedGameIds().has(gameId);
  }

  toggleGameFollow(game: GameModel): void {
    if (this.togglingGameId() !== null) {
      return;
    }
    this.togglingGameId.set(game.id);
    this.followService
      .toggleGameFollow(game.id)
      .pipe(finalize(() => this.togglingGameId.set(null)))
      .subscribe({
        next: (result) => {
          this.followedGameIds.update((ids) => {
            const next = new Set(ids);
            if (result.following) {
              next.add(game.id);
            } else {
              next.delete(game.id);
            }
            return next;
          });
        },
        error: () => this.notificationService.error('Failed to update follow status.'),
      });
  }

  unfollowUser(user: FollowedUserModel): void {
    this.followService.toggleUserFollow(user.userId).subscribe({
      next: (result) => {
        if (!result.following) {
          this.followedUsers.update((users) => users.filter((u) => u.userId !== user.userId));
        }
      },
      error: () => this.notificationService.error('Failed to update follow status.'),
    });
  }
}
