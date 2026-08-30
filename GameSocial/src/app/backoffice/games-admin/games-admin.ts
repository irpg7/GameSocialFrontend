import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameService } from '../../services/game/game.service';
import { NotificationService } from '../../services/notification/notification.service';
import { GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const POSTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-games-admin',
  imports: [FormsModule],
  templateUrl: './games-admin.html',
  styleUrl: './games-admin.scss',
})
export class GamesAdmin implements OnInit {
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly isLoading = signal(true);

  protected readonly newName = signal('');
  private newPosterFile = signal<File | null>(null);
  protected readonly isCreating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly editingId = signal<number | null>(null);
  protected readonly editName = signal('');
  private editPosterFile = signal<File | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly editError = signal<string | null>(null);

  protected readonly deletingId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadGames();
  }

  onNewPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newPosterFile.set(input.files?.[0] ?? null);
  }

  createGame(): void {
    const name = this.newName().trim();
    if (!name) {
      this.createError.set('Name is required.');
      return;
    }
    const file = this.newPosterFile();
    const fileError = this.validatePoster(file);
    if (fileError) {
      this.createError.set(fileError);
      return;
    }

    this.createError.set(null);
    this.isCreating.set(true);
    const formData = new FormData();
    formData.append('Name', name);
    if (file) {
      formData.append('Poster', file);
    }

    this.gameService
      .create(formData)
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe({
        next: (game) => {
          this.games.update((existing) => [...existing, game].sort((a, b) => a.name.localeCompare(b.name)));
          this.newName.set('');
          this.newPosterFile.set(null);
        },
        error: (err) => this.createError.set(extractApiErrorMessage(err, 'Failed to create game.')),
      });
  }

  startEdit(game: GameModel): void {
    this.editingId.set(game.id);
    this.editName.set(game.name);
    this.editPosterFile.set(null);
    this.editError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  onEditPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editPosterFile.set(input.files?.[0] ?? null);
  }

  saveEdit(game: GameModel): void {
    const name = this.editName().trim();
    if (!name) {
      this.editError.set('Name is required.');
      return;
    }
    const file = this.editPosterFile();
    const fileError = this.validatePoster(file);
    if (fileError) {
      this.editError.set(fileError);
      return;
    }

    this.editError.set(null);
    this.isSaving.set(true);
    const formData = new FormData();
    formData.append('Name', name);
    if (file) {
      formData.append('Poster', file);
    }

    this.gameService
      .update(game.id, formData)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => {
          this.games.update((existing) =>
            existing.map((g) => (g.id === updated.id ? updated : g)).sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.editingId.set(null);
        },
        error: (err) => this.editError.set(extractApiErrorMessage(err, 'Failed to update game.')),
      });
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
        next: () => this.games.update((existing) => existing.filter((g) => g.id !== game.id)),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to delete game.')),
      });
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

  private loadGames(): void {
    this.isLoading.set(true);
    this.gameService
      .getGames()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (games) => this.games.set(games),
        error: () => this.notificationService.error('Failed to load games.'),
      });
  }
}
