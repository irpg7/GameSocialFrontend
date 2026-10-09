import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GAME_GENRES, GameGenreName, GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';

/**
 * One-time step shown right after registration (see Register.submit): pick
 * genres you're into, then pick specific games to follow from within them.
 * Deliberately NOT a persistent "recommended for you" mechanism — this is
 * the only place suggestions appear; afterwards users discover games/people
 * through the normal Games/Discover pages, per product decision.
 */
const GAMES_PAGE_SIZE = 48;

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  protected readonly genres = GAME_GENRES;
  protected readonly step = signal<1 | 2>(1);
  protected readonly selectedGenres = signal<Set<GameGenreName>>(new Set());
  /** Games of the picked genres, a page at a time (the catalogue is paged server-side). */
  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoadingGames = signal(false);
  protected readonly hasMoreGames = signal(false);
  private readonly gamesPage = signal(1);
  protected readonly selectedGameIds = signal<Set<number>>(new Set());
  protected readonly isFinishing = signal(false);

  loadMoreGames(): void {
    if (!this.isLoadingGames() && this.hasMoreGames()) {
      this.loadGames(this.gamesPage() + 1);
    }
  }

  private loadGames(page: number): void {
    const genres = Array.from(this.selectedGenres());
    this.isLoadingGames.set(true);
    this.gameService
      .list({ genres, page, pageSize: GAMES_PAGE_SIZE })
      .pipe(finalize(() => this.isLoadingGames.set(false)))
      .subscribe({
        next: (result) => {
          this.games.update((games) => (page === 1 ? result.items : [...games, ...result.items]));
          this.gamesPage.set(page);
          this.hasMoreGames.set(result.hasMore);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load games.')),
      });
  }

  toggleGenre(genre: GameGenreName): void {
    this.selectedGenres.update((current) => {
      const next = new Set(current);
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
      return next;
    });
  }

  isGenreSelected(genre: GameGenreName): boolean {
    return this.selectedGenres().has(genre);
  }

  goToGameStep(): void {
    this.step.set(2);
    this.games.set([]);
    this.loadGames(1);
  }

  backToGenreStep(): void {
    this.step.set(1);
  }

  toggleGame(game: GameModel): void {
    this.selectedGameIds.update((current) => {
      const next = new Set(current);
      if (next.has(game.id)) {
        next.delete(game.id);
      } else {
        next.add(game.id);
      }
      return next;
    });
  }

  isGameSelected(game: GameModel): boolean {
    return this.selectedGameIds().has(game.id);
  }

  finish(): void {
    const gameIds = Array.from(this.selectedGameIds());
    if (gameIds.length === 0) {
      this.router.navigateByUrl('/feed');
      return;
    }
    this.isFinishing.set(true);
    forkJoin(gameIds.map((gameId) => this.followService.toggleGameFollow(gameId)))
      .pipe(finalize(() => this.isFinishing.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl('/feed'),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to follow the selected games. Please try again.')),
      });
  }

  skip(): void {
    this.router.navigateByUrl('/feed');
  }
}
