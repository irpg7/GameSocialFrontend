import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormField, form, maxLength, submit, validate } from '@angular/forms/signals';
import { Subscription, debounceTime, distinctUntilChanged, finalize, firstValueFrom, skip } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GAME_GENRES, GameGenreName, GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { Pager } from '../../shared/pager/pager';
import { SERVER_ERROR, fieldError, serverError, submitError } from '../../shared/form-errors';

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const POSTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_STUDIO_LENGTH = 150;
const PAGE_SIZE = 25;

/** Create and edit share one shape. Genres stay a list toggled by the checkboxes (not form fields). */
interface GameFormModel {
  name: string;
  studio: string;
  developer: string;
  /** yyyy-mm-dd from the date input; '' = not set. */
  releaseDate: string;
  genres: GameGenreName[];
}

const EMPTY_GAME: GameFormModel = { name: '', studio: '', developer: '', releaseDate: '', genres: [] };

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

@Component({
  selector: 'app-games-admin',
  imports: [ImgFallback, FormField, Pager],
  templateUrl: './games-admin.html',
  styleUrl: './games-admin.scss',
})
export class GamesAdmin implements OnInit {
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);

  /** One page of the catalogue (GET /api/games is paged); the search box narrows it on the server. */
  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = PAGE_SIZE;
  private loadRequest?: Subscription;
  protected readonly genres = GAME_GENRES;

  // ─── New game ──────────────────────────────────────────────────
  private readonly newModel = signal<GameFormModel>({ ...EMPTY_GAME });
  /** File inputs are not form fields: the picked poster lives next to the model. */
  private newPosterFile = signal<File | null>(null);

  protected readonly newForm = form(
    this.newModel,
    (path) => {
      validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: 'Name is required.' }));
      maxLength(path.studio, MAX_STUDIO_LENGTH);
    },
    {
      submission: {
        action: async () => {
          const posterError = this.validatePoster(this.newPosterFile());
          if (posterError) {
            return { kind: SERVER_ERROR, message: posterError };
          }
          try {
            const game = await firstValueFrom(this.gameService.create(this.toFormData(this.newModel(), this.newPosterFile())));
            this.notificationService.success(`${game.name} added.`);
            this.loadGames(this.page());
            this.newModel.set({ ...EMPTY_GAME });
            this.newPosterFile.set(null);
            this.newForm().reset();
            return undefined;
          } catch (err) {
            return serverError(err, 'Failed to create game.');
          }
        },
      },
    },
  );

  // ─── Edit (one row at a time) ──────────────────────────────────
  protected readonly editingId = signal<number | null>(null);
  private readonly editModel = signal<GameFormModel>({ ...EMPTY_GAME });
  private editPosterFile = signal<File | null>(null);

  protected readonly editForm = form(
    this.editModel,
    (path) => {
      validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: 'Name is required.' }));
      maxLength(path.studio, MAX_STUDIO_LENGTH);
    },
    {
      submission: {
        action: async () => {
          const id = this.editingId();
          if (id === null) {
            return undefined;
          }
          const posterError = this.validatePoster(this.editPosterFile());
          if (posterError) {
            return { kind: SERVER_ERROR, message: posterError };
          }
          try {
            // Omitted release date = cleared (the server sets whatever the form sends).
            const updated = await firstValueFrom(this.gameService.update(id, this.toFormData(this.editModel(), this.editPosterFile())));
            this.games.update((existing) =>
              existing.map((g) => (g.id === updated.id ? updated : g)).sort((a, b) => a.name.localeCompare(b.name)),
            );
            this.editingId.set(null);
            return undefined;
          } catch (err) {
            return serverError(err, 'Failed to update game.');
          }
        },
      },
    },
  );

  protected readonly deletingId = signal<number | null>(null);

  /** The single error line under each form: "Name is required." first, then poster / server errors. */
  protected readonly createError = () => fieldError(this.newForm.name()) ?? submitError(this.newForm());
  protected readonly editError = () => fieldError(this.editForm.name()) ?? submitError(this.editForm());

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

  onNewPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newPosterFile.set(input.files?.[0] ?? null);
  }

  createGame(): void {
    void submit(this.newForm);
  }

  toggleNewGenre(genre: GameGenreName): void {
    this.newModel.update((model) => ({ ...model, genres: toggleIn(model.genres, genre) }));
  }

  isNewGenreSelected(genre: GameGenreName): boolean {
    return this.newModel().genres.includes(genre);
  }

  toggleEditGenre(genre: GameGenreName): void {
    this.editModel.update((model) => ({ ...model, genres: toggleIn(model.genres, genre) }));
  }

  isEditGenreSelected(genre: GameGenreName): boolean {
    return this.editModel().genres.includes(genre);
  }

  startEdit(game: GameModel): void {
    this.editingId.set(game.id);
    this.editModel.set({
      name: game.name,
      studio: game.studio ?? '',
      developer: game.developerUsername ?? '',
      releaseDate: game.releaseDate ?? '',
      genres: [...game.genres],
    });
    this.editPosterFile.set(null);
    this.editForm().reset();
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  onEditPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editPosterFile.set(input.files?.[0] ?? null);
  }

  saveEdit(): void {
    void submit(this.editForm);
  }

  deleteGame(game: GameModel): void {
    if (!confirm(`Delete "${game.name}"? This cannot be undone.`)) {
      return;
    }
    this.deletingId.set(game.id);
    this.gameService
      .delete(game.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        // Reload so the page refills (and steps back if it was the last row of the last page).
        next: () => this.loadGames(this.games().length === 1 && this.page() > 1 ? this.page() - 1 : this.page()),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete game.')),
      });
  }

  private toFormData(model: GameFormModel, poster: File | null): FormData {
    const formData = new FormData();
    formData.append('Name', model.name.trim());
    for (const genre of model.genres) {
      formData.append('Genres', genre);
    }
    formData.append('Studio', model.studio.trim());
    formData.append('DeveloperUsername', model.developer.trim());
    // Sent only when set — an empty value would not bind as a date.
    if (model.releaseDate) {
      formData.append('ReleaseDate', model.releaseDate);
    }
    if (poster) {
      formData.append('Poster', poster);
    }
    return formData;
  }

  private validatePoster(file: File | null): string | null {
    if (!file) {
      return null;
    }
    if (!POSTER_MIME_TYPES.includes(file.type)) {
      return 'Poster must be a jpg, png or webp image.';
    }
    if (file.size > MAX_POSTER_BYTES) {
      return 'Poster must be 5MB or smaller.';
    }
    return null;
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
