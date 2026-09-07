import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GAME_GENRES, GameGenreName, GameModel } from '../../models/game.model';

/**
 * One-time step shown right after registration (see Register.submit): pick
 * genres you're into, then pick specific games to follow from within them.
 * Deliberately NOT a persistent "recommended for you" mechanism — this is
 * the only place suggestions appear; afterwards users discover games/people
 * through the normal Games/Discover pages, per product decision.
 */
@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding implements OnInit {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  protected readonly genres = GAME_GENRES;
  protected readonly step = signal<1 | 2>(1);
  protected readonly selectedGenres = signal<Set<GameGenreName>>(new Set());
  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoadingGames = signal(false);
  protected readonly selectedGameIds = signal<Set<number>>(new Set());
  protected readonly isFinishing = signal(false);

  protected readonly filteredGames = computed(() => {
    const genres = this.selectedGenres();
    const games = this.games();
    return genres.size === 0 ? games : games.filter((game) => game.genres.some((genre) => genres.has(genre)));
  });

  ngOnInit(): void {
    this.isLoadingGames.set(true);
    this.gameService
      .getGames()
      .pipe(finalize(() => this.isLoadingGames.set(false)))
      .subscribe({
        next: (games) => this.games.set(games),
        error: () => this.notificationService.error('Failed to load games.'),
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
        error: () => this.notificationService.error('Failed to follow the selected games. Please try again.'),
      });
  }

  skip(): void {
    this.router.navigateByUrl('/feed');
  }
}
