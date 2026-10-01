import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { GameService } from '../../services/game/game.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GameModel } from '../../models/game.model';

@Component({
  selector: 'app-games',
  imports: [],
  templateUrl: './games.html',
  styleUrl: './games.scss',
})
export class Games implements OnInit {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly searchQuery = signal('');
  /** Ids of games you follow — they feed the feed sidebar's "Games" list. */
  protected readonly followedIds = signal<number[]>([]);
  protected readonly busyId = signal<number | null>(null);

  protected readonly filteredGames = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const games = this.games();
    return query ? games.filter((game) => game.name.toLowerCase().includes(query)) : games;
  });

  ngOnInit(): void {
    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
    this.followService.getFollowedGames().subscribe({
      next: (games) => this.followedIds.set(games.map((game) => game.id)),
      error: () => void 0,
    });
  }

  protected isFollowing(game: GameModel): boolean {
    return this.followedIds().includes(game.id);
  }

  protected toggleFollow(game: GameModel): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(game.id);
    this.followService.toggleGameFollow(game.id).subscribe({
      next: (result) => {
        this.followedIds.update((ids) =>
          result.following ? [...ids.filter((id) => id !== game.id), game.id] : ids.filter((id) => id !== game.id),
        );
        this.busyId.set(null);
      },
      error: () => {
        this.busyId.set(null);
        this.notificationService.error('Failed to update follow status.');
      },
    });
  }
}
