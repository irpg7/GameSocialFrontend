import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { GameService } from '../../services/game/game.service';
import { SquadModel, JoinPolicyName } from '../../models/squad.model';
import { GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { SheetModal } from '../../shared/sheet-modal/sheet-modal';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CHANNEL_NAME_LENGTH = 50;

/**
 * Squad hub/list — Phase 4 replaces the Phase 1 placeholder's "coming soon"
 * copy with a real create-squad flow. No "Find a squad" browse/discovery —
 * confirmed there is no backend endpoint for listing joinable squads (same
 * documented gap as the People-follow-discovery limitation from Phase 1);
 * only creating one or being added by a Captain actually works.
 */
@Component({
  selector: 'app-squads',
  imports: [RouterLink, FormsModule, SheetModal],
  templateUrl: './squads.html',
  styleUrl: './squads.scss',
})
export class Squads implements OnInit {
  private squadService = inject(SquadService);
  private gameService = inject(GameService);
  private router = inject(Router);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly games = signal<GameModel[]>([]);

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxDescriptionLength = MAX_DESCRIPTION_LENGTH;
  protected readonly maxChannelNameLength = MAX_CHANNEL_NAME_LENGTH;

  protected readonly isCreateSheetOpen = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly primaryGameId = signal<number | null>(null);
  protected readonly joinPolicy = signal<JoinPolicyName>('InviteOnly');
  protected readonly additionalChannelNames = signal<string[]>([]);
  protected readonly newChannelName = signal('');

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadMine();

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
  }

  openCreateSheet(): void {
    this.isCreateSheetOpen.set(true);
  }

  closeCreateSheet(): void {
    this.isCreateSheetOpen.set(false);
  }

  addChannelName(): void {
    const name = this.newChannelName().trim();
    if (!name) {
      return;
    }
    const normalized = name.toLowerCase();
    if (normalized === 'general' || normalized === 'clips') {
      this.errorMessage.set('#general and #clips are already created automatically.');
      return;
    }
    if (this.additionalChannelNames().some((existing) => existing.toLowerCase() === normalized)) {
      this.errorMessage.set('That channel name is already added.');
      return;
    }
    this.additionalChannelNames.update((names) => [...names, name]);
    this.newChannelName.set('');
    this.errorMessage.set(null);
  }

  removeChannelName(index: number): void {
    this.additionalChannelNames.update((names) => names.filter((_, i) => i !== index));
  }

  submitCreate(): void {
    this.errorMessage.set(null);
    if (!this.name().trim()) {
      this.errorMessage.set('Squad name is required.');
      return;
    }
    if (this.name().length > MAX_NAME_LENGTH) {
      this.errorMessage.set(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (this.description().length > MAX_DESCRIPTION_LENGTH) {
      this.errorMessage.set(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
      return;
    }

    this.isSubmitting.set(true);
    this.squadService
      .create({
        name: this.name().trim(),
        description: this.description().trim() || undefined,
        joinPolicy: this.joinPolicy(),
        primaryGameId: this.primaryGameId() ?? undefined,
        additionalChannelNames: this.additionalChannelNames().length > 0 ? this.additionalChannelNames() : undefined,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (squad) => {
          this.isCreateSheetOpen.set(false);
          this.resetCreateForm();
          // Jump straight into the new squad's room.
          this.router.navigate(['/squads', squad.id]);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to create squad. Please try again.')),
      });
  }

  private resetCreateForm(): void {
    this.name.set('');
    this.description.set('');
    this.primaryGameId.set(null);
    this.joinPolicy.set('InviteOnly');
    this.additionalChannelNames.set([]);
    this.newChannelName.set('');
  }

  private loadMine(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => {
        this.mySquads.set(squads);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }
}
