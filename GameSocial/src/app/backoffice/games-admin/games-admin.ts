import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, distinctUntilChanged, finalize, skip } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { Pager } from '../../shared/pager/pager';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { GameFormSheet } from '../game-form-sheet/game-form-sheet';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-games-admin',
  imports: [ImgFallback, Pager, GameFormSheet],
  templateUrl: './games-admin.html',
  styleUrl: './games-admin.scss',
})
export class GamesAdmin implements OnInit {
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);
  private confirm = inject(ConfirmService);

  /** One page of the catalogue (GET /api/games is paged); the search box narrows it on the server. */
  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = PAGE_SIZE;
  private loadRequest?: Subscription;

  /** The add / edit modal: 'new', a game being edited, or null when closed. */
  protected readonly sheet = signal<GameModel | 'new' | null>(null);
  protected readonly deletingId = signal<number | null>(null);

  constructor() {
    toObservable(this.searchQuery)
      .pipe(skip(1), debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.loadGames(1));
  }

  ngOnInit(): void {
    this.loadGames(1);
  }

  protected goToPage(page: number): void {
    this.loadGames(page);
  }

  protected editedGame(): GameModel | null {
    const sheet = this.sheet();
    return sheet === 'new' ? null : sheet;
  }

  protected onSaved(game: GameModel): void {
    const created = this.sheet() === 'new';
    this.sheet.set(null);
    this.notificationService.success(created ? `${game.name} added.` : `${game.name} saved.`);
    if (created) {
      this.loadGames(this.page());
    } else {
      this.games.update((list) => list.map((g) => (g.id === game.id ? game : g)).sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  protected async deleteGame(game: GameModel): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Delete ${game.name}?`,
      message: 'The game leaves the catalogue for everyone. This cannot be undone.',
      confirmLabel: 'Delete game',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(game.id);
    this.gameService
      .delete(game.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.notificationService.success(`${game.name} deleted.`);
          // Reload so the page refills (and steps back if it was the last row of the last page).
          this.loadGames(this.games().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete game.')),
      });
  }

  private loadGames(page: number): void {
    this.loadRequest?.unsubscribe();
    this.isLoading.set(true);
    this.loadRequest = this.gameService
      .list({ search: this.searchQuery().trim() || undefined, page, pageSize: PAGE_SIZE })
      .subscribe({
        next: (result) => {
          this.games.set(result.items);
          this.page.set(result.page);
          this.totalCount.set(result.totalCount);
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          this.isLoading.set(false);
          this.notificationService.error(extractApiErrorMessage(err, 'Failed to load games.'));
        },
      });
  }
}
