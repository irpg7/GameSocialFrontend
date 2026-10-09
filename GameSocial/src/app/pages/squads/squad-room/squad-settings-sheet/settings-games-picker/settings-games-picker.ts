import { Component, computed, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormField, form } from '@angular/forms/signals';
import { debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs';
import { SquadHubService } from '../../../../../services/squad/squad-hub.service';
import { NotificationService } from '../../../../../services/notification/notification.service';
import { MAX_SQUAD_GAMES, SquadGameModel } from '../../../../../models/squad.model';
import { SquadGameOptionModel } from '../../../../../models/squad-hub.model';
import { extractApiErrorMessage } from '../../../../../shared/api-error.util';
import { ImgFallback } from '../../../../../shared/img-fallback/img-fallback';

/**
 * Settings → Genel → "Ana oyunlar": the picked game chips and the searchable library picker
 * (07-squad-settings.html). Edits `games`; the sheet saves them with the rest of the form.
 */
@Component({
  selector: 'app-settings-games-picker',
  imports: [FormField, ImgFallback],
  templateUrl: './settings-games-picker.html',
  styleUrl: './settings-games-picker.scss',
})
export class SettingsGamesPicker {
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);

  games = model.required<SquadGameModel[]>();
  canManage = input(false);

  protected readonly maxGames = MAX_SQUAD_GAMES;
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly queryField = form(this.query);
  protected readonly options = signal<SquadGameOptionModel[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(false);
  protected readonly canAdd = computed(() => this.games().length < MAX_SQUAD_GAMES);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => {
          this.isLoading.set(true);
          return this.hubService.getGameOptions(q.trim() || undefined).pipe(finalize(() => this.isLoading.set(false)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (result) => {
          this.options.set(result.items);
          this.total.set(result.totalCount);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Oyunlar yüklenemedi.')),
      });
  }

  protected isSelected(gameId: number): boolean {
    return this.games().some((g) => g.id === gameId);
  }

  protected meta(option: SquadGameOptionModel): string {
    if (option.kind === 'library') {
      return option.hoursPlayed ? `Kütüphanende · ${option.hoursPlayed} sa` : 'Kütüphanende';
    }
    if (option.kind === 'new') {
      return 'Yeni çıkan';
    }
    return `Popüler · ${compactCount(option.followerCount)} oyuncu`;
  }

  protected toggle(): void {
    this.isOpen.update((open) => !open);
    this.query.set('');
  }

  protected add(option: SquadGameOptionModel): void {
    if (this.isSelected(option.id) || !this.canAdd()) {
      return;
    }
    this.games.update((games) => [...games, { id: option.id, name: option.name, coverImageUrl: option.coverImageUrl }]);
    this.query.set('');
  }

  protected remove(gameId: number): void {
    this.games.update((games) => games.filter((g) => g.id !== gameId));
  }

  protected suggest(): void {
    this.notificationService.info('Oyun önerisi henüz desteklenmiyor.');
  }
}

/** 84000 → "84k", 1200 → "1.2k". */
function compactCount(value: number): string {
  if (value >= 1_000_000) return `${trimZero(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimZero(value / 1_000)}k`;
  return String(value);
}

function trimZero(value: number): string {
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
}
