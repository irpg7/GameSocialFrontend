import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { GameService } from '../../services/game/game.service';
import { JoinPolicyName, SquadModel } from '../../models/squad.model';
import { GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../api-error.util';
import { SheetModal } from '../sheet-modal/sheet-modal';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CHANNEL_NAME_LENGTH = 50;

interface JoinPolicyOption {
  value: JoinPolicyName;
  label: string;
  description: string;
}

/**
 * Create-squad sheet, shared by the squads entry screen's welcome state and
 * the squad room's sidebar "＋ New squad" button.
 *
 * Follows Gamer Feed.dc.html's `sheetSquad` state: a 74px squad icon beside
 * the name + main-game fields, a purpose textarea, "Who can join" as three
 * *described* radio cards (not a bare chip row), starter-channel chips, and an
 * invite nudge row.
 *
 * Two deliberate departures from the mock, both because the backend has no
 * such feature and a dead control would be a lie:
 *  - the dashed "Squad icon" upload slot is a live initial-letter preview
 *    instead (there is no image upload), keeping the 74px/22px geometry;
 *  - the "Save draft" footer button is dropped (no draft storage).
 *
 * The mock's single "Main game" select is kept as-is: multi-game selection is
 * a squad *settings* feature in the design, not a create-time one. The backend
 * expands a lone primaryGameId into a one-item game list (SquadGameSetResolver).
 */
@Component({
  selector: 'app-squad-create-sheet',
  imports: [FormsModule, SheetModal],
  templateUrl: './squad-create-sheet.html',
  styleUrl: './squad-create-sheet.scss',
})
export class SquadCreateSheet implements OnInit {
  private squadService = inject(SquadService);
  private gameService = inject(GameService);

  created = output<SquadModel>();
  closed = output<void>();

  protected readonly games = signal<GameModel[]>([]);

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxDescriptionLength = MAX_DESCRIPTION_LENGTH;
  protected readonly maxChannelNameLength = MAX_CHANNEL_NAME_LENGTH;

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly primaryGameId = signal<number | null>(null);
  protected readonly joinPolicy = signal<JoinPolicyName>('InviteOnly');
  protected readonly additionalChannelNames = signal<string[]>([]);
  protected readonly newChannelName = signal('');

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** The mock's three described cards, copy included. */
  protected readonly joinPolicies: JoinPolicyOption[] = [
    { value: 'InviteOnly', label: 'Invite only', description: 'You add people yourself' },
    { value: 'AskToJoin', label: 'Ask to join', description: 'Requests land in your inbox' },
    { value: 'Open', label: 'Open', description: 'Anyone can walk in' },
  ];

  ngOnInit(): void {
    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
  }

  /** Drives the 74px icon preview — the design shows a squad mark here. */
  protected initial(): string {
    return this.name().trim().charAt(0).toUpperCase();
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

  submit(): void {
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
        next: (squad) => this.created.emit(squad),
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to create squad. Please try again.')),
      });
  }
}
