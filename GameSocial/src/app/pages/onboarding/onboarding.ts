import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, finalize, forkJoin, of } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { FollowService } from '../../services/follow/follow.service';
import { MeService } from '../../services/me/me.service';
import { SquadHubService } from '../../services/squad/squad-hub.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GAME_GENRES, GameGenreName, GameModel } from '../../models/game.model';
import { SquadModel } from '../../models/squad.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { LoadError } from '../../shared/load-error/load-error';

/**
 * First sign-in (MeModel.needsOnboarding → MainLayout sends the user here): pick genres, follow games from them, then
 * join a squad or two that plays those games. Finishing or skipping marks it done on the server, so it never comes
 * back. Deliberately NOT a persistent "recommended for you" mechanism; afterwards users discover games, people and
 * squads through the normal pages, per product decision.
 */
const GAMES_PAGE_SIZE = 48;
const SQUAD_SUGGESTIONS = 6;

type Step = 1 | 2 | 3;
type JoinState = 'joining' | 'Active' | 'Pending';

@Component({
  selector: 'app-onboarding',
  imports: [ImgFallback, LoadError],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private gameService = inject(GameService);
  private followService = inject(FollowService);
  private meService = inject(MeService);
  private squadHub = inject(SquadHubService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly genres = GAME_GENRES;
  protected readonly step = signal<Step>(1);
  protected readonly selectedGenres = signal<Set<GameGenreName>>(new Set());
  /** Games of the picked genres, a page at a time (the catalogue is paged server-side). */
  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoadingGames = signal(false);
  protected readonly gamesError = signal<string | null>(null);
  protected readonly hasMoreGames = signal(false);
  private readonly gamesPage = signal(1);
  protected readonly selectedGameIds = signal<Set<number>>(new Set());
  protected readonly isSavingGames = signal(false);

  /** Step 3: squads the server suggests from the games just followed. */
  protected readonly squads = signal<SquadModel[]>([]);
  protected readonly isLoadingSquads = signal(false);
  protected readonly squadsError = signal<string | null>(null);
  protected readonly joinStates = signal<Readonly<Record<string, JoinState>>>({});
  protected readonly isFinishing = signal(false);

  // ─── Step 1: genres ───────────────────────────────────────────────────
  toggleGenre(genre: GameGenreName): void {
    this.selectedGenres.update((current) => toggled(current, genre));
  }

  isGenreSelected(genre: GameGenreName): boolean {
    return this.selectedGenres().has(genre);
  }

  goToGameStep(): void {
    this.step.set(2);
    this.games.set([]);
    this.loadGames(1);
  }

  // ─── Step 2: games ────────────────────────────────────────────────────
  protected loadGames(page: number): void {
    const genres = Array.from(this.selectedGenres());
    this.isLoadingGames.set(true);
    this.gamesError.set(null);
    this.gameService
      .list({ genres, page, pageSize: GAMES_PAGE_SIZE })
      .pipe(finalize(() => this.isLoadingGames.set(false)))
      .subscribe({
        next: (result) => {
          this.games.update((games) => (page === 1 ? result.items : [...games, ...result.items]));
          this.gamesPage.set(page);
          this.hasMoreGames.set(result.hasMore);
        },
        error: (err: unknown) => {
          if (page === 1) {
            this.gamesError.set('Oyunlar yüklenemedi.');
          } else {
            this.notificationService.error(extractApiErrorMessage(err, 'Failed to load games.'));
          }
        },
      });
  }

  loadMoreGames(): void {
    if (!this.isLoadingGames() && this.hasMoreGames()) {
      this.loadGames(this.gamesPage() + 1);
    }
  }

  toggleGame(game: GameModel): void {
    this.selectedGameIds.update((current) => toggled(current, game.id));
  }

  isGameSelected(game: GameModel): boolean {
    return this.selectedGameIds().has(game.id);
  }

  backTo(step: Step): void {
    this.step.set(step);
  }

  /** Follows the picked games (the follow endpoint is a toggle, so ones already followed are left alone), then step 3. */
  goToSquadStep(): void {
    const toFollow = this.games().filter((game) => this.selectedGameIds().has(game.id) && !game.isFollowed);
    const follows: Observable<unknown> = toFollow.length
      ? forkJoin(toFollow.map((game) => this.followService.toggleGameFollow(game.id)))
      : of(null);
    this.isSavingGames.set(true);
    follows.pipe(finalize(() => this.isSavingGames.set(false))).subscribe({
      next: () => {
        this.games.update((games) => games.map((game) => (this.selectedGameIds().has(game.id) ? { ...game, isFollowed: true } : game)));
        this.step.set(3);
        this.loadSquads();
      },
      error: (err: unknown) =>
        this.notificationService.error(extractApiErrorMessage(err, 'Failed to follow the selected games. Please try again.')),
    });
  }

  // ─── Step 3: squads ───────────────────────────────────────────────────
  protected loadSquads(): void {
    this.isLoadingSquads.set(true);
    this.squadsError.set(null);
    this.squadHub
      .discover({ pageSize: SQUAD_SUGGESTIONS })
      .pipe(finalize(() => this.isLoadingSquads.set(false)))
      .subscribe({
        next: (result) => this.squads.set(result.items.filter((squad) => !squad.currentUserRole)),
        error: () => this.squadsError.set("Squad'lar yüklenemedi."),
      });
  }

  join(squad: SquadModel): void {
    if (this.joinStates()[squad.id]) {
      return;
    }
    this.setJoinState(squad.id, 'joining');
    this.squadHub.join(squad.id).subscribe({
      next: (result) => this.setJoinState(squad.id, result.status === 'Active' ? 'Active' : 'Pending'),
      error: (err: unknown) => {
        this.setJoinState(squad.id, null);
        this.notificationService.error(extractApiErrorMessage(err, "Squad'a katılınamadı."));
      },
    });
  }

  joinLabel(squad: SquadModel): string {
    switch (this.joinStates()[squad.id]) {
      case 'joining':
        return 'Katılınıyor…';
      case 'Active':
        return 'Katıldın ✓';
      case 'Pending':
        return 'İstek gönderildi';
      default:
        return squad.joinPolicy === 'Open' ? 'Katıl' : 'Katılma isteği';
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────
  finish(): void {
    this.complete();
  }

  /** Skipping counts as done too: the user chose not to, and it should not come back. */
  skip(): void {
    this.complete();
  }

  private complete(): void {
    this.isFinishing.set(true);
    this.meService
      .completeOnboarding()
      .pipe(finalize(() => this.isFinishing.set(false)))
      .subscribe({
        // Even if marking fails, don't trap the user here; the next sign-in shows it again.
        next: () => this.leave(),
        error: () => this.leave(),
      });
  }

  private leave(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.startsWith('/onboarding');
    void this.router.navigateByUrl(safe ? returnUrl : '/feed');
  }

  private setJoinState(squadId: string, state: JoinState | null): void {
    this.joinStates.update((states) => {
      const next = { ...states };
      if (state) {
        next[squadId] = state;
      } else {
        delete next[squadId];
      }
      return next;
    });
  }
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
