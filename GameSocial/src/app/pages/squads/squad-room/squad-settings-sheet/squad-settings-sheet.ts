import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import {
  JoinPolicyName,
  MAX_SQUAD_GAMES,
  SquadMemberModel,
  SquadModel,
} from '../../../../models/squad.model';
import { GameModel } from '../../../../models/game.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';

type SettingsTab = 'general' | 'members';

interface JoinPolicyOption {
  value: JoinPolicyName;
  label: string;
  description: string;
}

/**
 * Squad settings sheet — Gamer Feed.dc.html's `sqSettings` state, which had no
 * implementation at all before this. Covers the mock's General tab
 * (`sqOnGeneral`, including the searchable game picker `sqGamePicker` and its
 * empty state `sqGameEmpty`) and Members tab (`sqOnMembers`).
 *
 * The mock's third tab (`sqOnContent` — per-squad content rule toggles) is not
 * built: there is no per-squad settings storage of any kind behind it, so the
 * toggles would not persist.
 *
 * Non-captains can open this to read the squad's setup and to leave; every
 * editing control is disabled for them, mirroring the server's captain-only
 * guards.
 */
@Component({
  selector: 'app-squad-settings-sheet',
  imports: [FormsModule, SheetModal],
  templateUrl: './squad-settings-sheet.html',
  styleUrl: './squad-settings-sheet.scss',
})
export class SquadSettingsSheet {
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);

  squad = input.required<SquadModel>();
  members = input.required<SquadMemberModel[]>();
  games = input.required<GameModel[]>();
  isCaptain = input(false);
  currentUserId = input<string | undefined>(undefined);

  saved = output<SquadModel>();
  /** Membership changed (role/remove/invite) — the room should reload it. */
  membersChanged = output<void>();
  /** The current user left; the room should navigate away. */
  left = output<void>();
  closed = output<void>();

  protected readonly maxGames = MAX_SQUAD_GAMES;
  protected readonly tab = signal<SettingsTab>('general');

  // Form state seeded from the squad, re-seeded when a different squad loads.
  protected readonly name = linkedSignal(() => this.squad().name);
  protected readonly description = linkedSignal(() => this.squad().description ?? '');
  protected readonly joinPolicy = linkedSignal<JoinPolicyName>(() => this.squad().joinPolicy);
  protected readonly selectedGameIds = linkedSignal<number[]>(() => this.squad().games.map((game) => game.id));
  protected readonly primaryGameId = linkedSignal<number | null>(() => this.squad().primaryGameId ?? null);

  protected readonly isGamePickerOpen = signal(false);
  protected readonly gameQuery = signal('');

  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly busyUserId = signal<string | null>(null);

  protected readonly inviteUsername = signal('');
  protected readonly isInviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);

  protected readonly isLeaveConfirmOpen = signal(false);
  protected readonly isLeaving = signal(false);

  protected readonly joinPolicies: JoinPolicyOption[] = [
    { value: 'InviteOnly', label: 'Invite only', description: 'You add people yourself' },
    { value: 'AskToJoin', label: 'Ask to join', description: 'Requests land in your inbox' },
    { value: 'Open', label: 'Open', description: 'Anyone can walk in' },
  ];

  protected readonly subtitle = computed(() => {
    const count = this.squad().memberCount;
    const role = this.isCaptain() ? 'You are the captain' : 'You are a member';
    const plural = count === 1 ? ' member' : ' members';
    return role + ' · ' + count + plural;
  });

  /** The selected games, in selection order, resolved against the game list. */
  protected readonly selectedGames = computed(() => {
    const byId = new Map(this.games().map((game) => [game.id, game]));
    return this.selectedGameIds()
      .map((id) => byId.get(id))
      .filter((game): game is GameModel => game != null);
  });

  protected readonly canAddGame = computed(() => this.selectedGameIds().length < MAX_SQUAD_GAMES);

  /** `sqGamePicker` — filtered client-side; the games list is already loaded. */
  protected readonly gameResults = computed(() => {
    const query = this.gameQuery().trim().toLowerCase();
    const pool = query ? this.games().filter((game) => game.name.toLowerCase().includes(query)) : this.games();
    return pool.slice(0, 40);
  });

  protected isGameSelected(gameId: number): boolean {
    return this.selectedGameIds().includes(gameId);
  }

  protected initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  protected toggleGamePicker(): void {
    this.isGamePickerOpen.update((open) => !open);
    this.gameQuery.set('');
  }

  protected addGame(game: GameModel): void {
    if (this.isGameSelected(game.id) || !this.canAddGame()) {
      return;
    }
    this.selectedGameIds.update((ids) => [...ids, game.id]);
    // The first game picked becomes the banner game until the captain says otherwise.
    if (this.primaryGameId() === null) {
      this.primaryGameId.set(game.id);
    }
  }

  protected removeGame(gameId: number): void {
    this.selectedGameIds.update((ids) => ids.filter((id) => id !== gameId));
    // The server requires primaryGameId to be one of gameIds.
    if (this.primaryGameId() === gameId) {
      this.primaryGameId.set(this.selectedGameIds()[0] ?? null);
    }
  }

  protected setPrimaryGame(gameId: number): void {
    this.primaryGameId.set(gameId);
  }

  protected isSelf(userId: string): boolean {
    return userId === this.currentUserId();
  }

  protected save(): void {
    this.errorMessage.set(null);
    if (!this.name().trim()) {
      this.errorMessage.set('Squad name is required.');
      return;
    }

    this.isSaving.set(true);
    this.squadService
      .update(this.squad().id, {
        name: this.name().trim(),
        description: this.description().trim() || undefined,
        joinPolicy: this.joinPolicy(),
        gameIds: this.selectedGameIds().length > 0 ? this.selectedGameIds() : undefined,
        primaryGameId: this.primaryGameId() ?? undefined,
      })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (squad) => {
          this.notificationService.success('Squad settings saved.');
          this.saved.emit(squad);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to save settings.')),
      });
  }

  protected invite(): void {
    const username = this.inviteUsername().trim();
    if (!username || this.isInviting()) {
      return;
    }
    this.inviteError.set(null);
    this.isInviting.set(true);
    this.squadService
      .addMember(this.squad().id, username)
      .pipe(finalize(() => this.isInviting.set(false)))
      .subscribe({
        next: () => {
          this.inviteUsername.set('');
          this.membersChanged.emit();
        },
        error: (err) => this.inviteError.set(extractApiErrorMessage(err, 'Failed to add member.')),
      });
  }

  /** The mock's role chip cycles between the two roles that exist. */
  protected toggleRole(member: SquadMemberModel): void {
    if (this.busyUserId()) {
      return;
    }
    const nextRole = member.role === 'Captain' ? 'Member' : 'Captain';
    this.busyUserId.set(member.userId);
    this.squadService
      .changeMemberRole(this.squad().id, member.userId, nextRole)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => this.membersChanged.emit(),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to change role.')),
      });
  }

  protected removeMember(member: SquadMemberModel): void {
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(member.userId);
    this.squadService
      .removeMember(this.squad().id, member.userId)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => this.membersChanged.emit(),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to remove member.')),
      });
  }

  protected confirmLeave(): void {
    this.isLeaveConfirmOpen.set(true);
  }

  protected cancelLeave(): void {
    this.isLeaveConfirmOpen.set(false);
  }

  protected leave(): void {
    if (this.isLeaving()) {
      return;
    }
    this.isLeaving.set(true);
    this.squadService
      .leave(this.squad().id)
      .pipe(finalize(() => this.isLeaving.set(false)))
      .subscribe({
        next: () => this.left.emit(),
        error: (err) => {
          this.isLeaveConfirmOpen.set(false);
          this.errorMessage.set(extractApiErrorMessage(err, 'Failed to leave squad.'));
        },
      });
  }
}
