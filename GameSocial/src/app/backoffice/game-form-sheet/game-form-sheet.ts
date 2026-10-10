import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { GAME_GENRES, GameGenreName, GameModel } from '../../models/game.model';
import { SheetModal } from '../../shared/sheet-modal/sheet-modal';
import { SERVER_ERROR, fieldError, serverError, submitError } from '../../shared/form-errors';
import { MAX_POSTER_BYTES, POSTER_MIME_TYPES, PosterPicker } from '../poster-picker/poster-picker';

const MAX_STUDIO_LENGTH = 150;

/** Genres stay a list toggled by the chips (not form fields). */
interface GameFormModel {
  name: string;
  studio: string;
  developer: string;
  /** yyyy-mm-dd from the date input; '' = not set. */
  releaseDate: string;
  genres: GameGenreName[];
}

/**
 * Backoffice → Games: add a game (`game` null) or edit one, in a modal instead of the old inline table row.
 * Emits the saved game; the parent refreshes its page.
 */
@Component({
  selector: 'app-game-form-sheet',
  imports: [FormField, FormRoot, SheetModal, PosterPicker],
  templateUrl: './game-form-sheet.html',
  styleUrl: './game-form-sheet.scss',
})
export class GameFormSheet {
  private gameService = inject(GameService);

  /** The game being edited; null = a new game. */
  readonly game = input<GameModel | null>(null);
  readonly saved = output<GameModel>();
  readonly closed = output<void>();

  protected readonly genres = GAME_GENRES;
  protected readonly isEdit = computed(() => this.game() !== null);
  protected readonly posterFile = signal<File | null>(null);

  /** Starts from the edited game (or empty) and is then edited by the form. */
  private readonly model = linkedSignal<GameFormModel>(() => {
    const game = this.game();
    return {
      name: game?.name ?? '',
      studio: game?.studio ?? '',
      developer: game?.developerUsername ?? '',
      releaseDate: game?.releaseDate ?? '',
      genres: game ? [...game.genres] : [],
    };
  });

  protected readonly gameForm = form(
    this.model,
    (path) => {
      validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: 'Name is required.' }));
      maxLength(path.studio, MAX_STUDIO_LENGTH);
    },
    {
      submission: {
        action: async () => {
          const posterError = this.validatePoster(this.posterFile());
          if (posterError) {
            return { kind: SERVER_ERROR, message: posterError };
          }
          const game = this.game();
          const formData = this.toFormData();
          try {
            const result = await firstValueFrom(game ? this.gameService.update(game.id, formData) : this.gameService.create(formData));
            this.saved.emit(result);
            return undefined;
          } catch (err) {
            return serverError(err, game ? 'Failed to update game.' : 'Failed to create game.');
          }
        },
      },
    },
  );

  /** One error line above the buttons: "Name is required." first, then poster / server errors. */
  protected readonly error = computed(() => fieldError(this.gameForm.name()) ?? submitError(this.gameForm()));

  protected isGenreSelected(genre: GameGenreName): boolean {
    return this.model().genres.includes(genre);
  }

  protected toggleGenre(genre: GameGenreName): void {
    this.model.update((model) => ({
      ...model,
      genres: model.genres.includes(genre) ? model.genres.filter((g) => g !== genre) : [...model.genres, genre],
    }));
  }

  private toFormData(): FormData {
    const model = this.model();
    const formData = new FormData();
    formData.append('Name', model.name.trim());
    for (const genre of model.genres) {
      formData.append('Genres', genre);
    }
    formData.append('Studio', model.studio.trim());
    formData.append('DeveloperUsername', model.developer.trim());
    // Sent only when set — an empty value would not bind as a date (omitted on edit = cleared).
    if (model.releaseDate) {
      formData.append('ReleaseDate', model.releaseDate);
    }
    const poster = this.posterFile();
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
}
