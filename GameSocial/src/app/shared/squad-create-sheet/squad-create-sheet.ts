import { Component, Injector, OnDestroy, OnInit, afterNextRender, computed, inject, output, signal } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { SelectControl } from '../select-control';
import { Observable, catchError, finalize, map, of, switchMap } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { SquadHubService } from '../../services/squad/squad-hub.service';
import { GameService } from '../../services/game/game.service';
import { NotificationService } from '../../services/notification/notification.service';
import { JoinPolicyName, SquadModel } from '../../models/squad.model';
import { GameModel } from '../../models/game.model';
import { extractApiErrorMessage } from '../api-error.util';
import { SquadSheetFrame } from './squad-sheet-frame';
import { PlayerOption, PlayerPicker } from '../player-picker/player-picker';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CHANNEL_NAME_LENGTH = 50;
const MAX_CHANNELS = 8;
const MAX_INVITES = 10;
const MAX_ICON_BYTES = 5 * 1024 * 1024;
const DRAFT_KEY = 'arena.squadDraft';

/** The design's preset chips; #genel and #clips start selected. */
const PRESET_CHANNELS = ['genel', 'clips', 'builds', 'spoiler-bölgesi'];
const DEFAULT_SELECTED = ['genel', 'clips'];

interface JoinPolicyOption {
  value: JoinPolicyName;
  label: string;
  description: string;
}

interface SquadDraft {
  name: string;
  description: string;
  primaryGameId: number | null;
  joinPolicy: JoinPolicyName;
  channels: string[];
  selectedChannels: string[];
  invitees: string[];
}

/**
 * Create-squad sheet — 08-sheets.html `sheetSquad`, 1:1: a 74px dashed
 * "Squad icon" upload slot beside label-less "Squad name" and
 * "Main game — … ▾" boxes, a purpose box, "Who can join" described cards,
 * toggleable "Başlangıç kanalları" preset chips plus a dashed "＋ channel",
 * the invite nudge (its dashed ＋ avatar opens a player picker — people you
 * follow first, then any player; only real accounts can be added), and a
 * Cancel / Save draft / Create squad footer.
 *
 * Squads have no server-side draft, so "Save draft" keeps the form in
 * localStorage and it is restored the next time the sheet opens. The icon is
 * uploaded right after the squad is created (POST squads/{id}/icon).
 */
@Component({
  selector: 'app-squad-create-sheet',
  imports: [FormField, SelectControl, SquadSheetFrame, PlayerPicker],
  templateUrl: './squad-create-sheet.html',
  styleUrl: './squad-create-sheet.scss',
})
export class SquadCreateSheet implements OnInit, OnDestroy {
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);
  private injector = inject(Injector);

  created = output<SquadModel>();
  closed = output<void>();

  protected readonly games = signal<GameModel[]>([]);

  /**
   * Name, purpose, main game and join policy (Signal Forms). `primaryGameId` is the select's
   * string value — '' = "Main game — none" — and becomes a number only when the squad is created.
   */
  private readonly model = signal({
    name: '',
    description: '',
    primaryGameId: '',
    joinPolicy: 'InviteOnly' as JoinPolicyName,
  });
  protected readonly squadForm = form(this.model, (path) => {
    maxLength(path.name, MAX_NAME_LENGTH);
    maxLength(path.description, MAX_DESCRIPTION_LENGTH);
  });
  protected readonly joinPolicy = computed(() => this.model().joinPolicy);

  /** Every chip shown, in order — presets first, then "＋ channel" additions. */
  protected readonly channels = signal<string[]>([...PRESET_CHANNELS]);
  protected readonly selectedChannels = signal<string[]>([...DEFAULT_SELECTED]);
  protected readonly isAddingChannel = signal(false);
  /** The "＋ channel" chip input — its own one-field form, committed into `channels`. */
  protected readonly newChannelName = signal('');
  protected readonly newChannelField = form(this.newChannelName, (path) => maxLength(path, MAX_CHANNEL_NAME_LENGTH));

  protected readonly invitees = signal<string[]>([]);
  protected readonly isInviting = signal(false);
  protected readonly maxInvites = MAX_INVITES;

  protected readonly iconFile = signal<File | null>(null);
  protected readonly iconPreview = signal<string | null>(null);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly joinPolicies: JoinPolicyOption[] = [
    { value: 'InviteOnly', label: 'Invite only', description: 'You add people yourself' },
    { value: 'AskToJoin', label: 'Ask to join', description: 'Requests land in your inbox' },
    { value: 'Open', label: 'Open', description: 'Anyone can walk in' },
  ];

  /** Two avatar slots in the nudge — filled by invitees, grey placeholders otherwise. */
  protected readonly nudgeSlots = computed(() => {
    const names = this.invitees();
    return [0, 1].map((i) => names[i] ?? null);
  });

  ngOnInit(): void {
    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
    this.restoreDraft();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  protected isSelected(channel: string): boolean {
    return this.selectedChannels().includes(channel);
  }

  protected toggleChannel(channel: string): void {
    this.selectedChannels.update((selected) =>
      selected.includes(channel) ? selected.filter((c) => c !== channel) : [...selected, channel],
    );
  }

  protected startAddChannel(): void {
    this.isAddingChannel.set(true);
    this.newChannelName.set('');
  }

  protected commitChannel(): void {
    const name = this.newChannelName().trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
    this.isAddingChannel.set(false);
    this.newChannelName.set('');
    if (!name) {
      return;
    }
    if (this.channels().some((c) => c.toLowerCase() === name)) {
      if (!this.isSelected(name)) {
        this.toggleChannel(name);
      }
      return;
    }
    if (this.selectedChannels().length >= MAX_CHANNELS) {
      this.errorMessage.set(`A squad starts with at most ${MAX_CHANNELS} channels.`);
      return;
    }
    this.channels.update((list) => [...list, name]);
    this.selectedChannels.update((list) => [...list, name]);
  }

  protected cancelChannel(): void {
    this.isAddingChannel.set(false);
    this.newChannelName.set('');
  }

  protected startInvite(): void {
    this.isInviting.set(true);
    afterNextRender(() => document.getElementById('invite-username')?.focus(), { injector: this.injector });
  }

  /** The picker only hands over real accounts, in the server's exact casing. */
  protected addInvitee(player: PlayerOption): void {
    if (this.invitees().length >= MAX_INVITES) {
      this.errorMessage.set(`You can invite at most ${MAX_INVITES} people at once.`);
      return;
    }
    if (!this.invitees().some((u) => u.toLowerCase() === player.username.toLowerCase())) {
      this.invitees.update((list) => [...list, player.username]);
    }
  }

  protected removeInvitee(username: string): void {
    this.invitees.update((list) => list.filter((u) => u !== username));
  }

  protected onIconPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/') || file.size > MAX_ICON_BYTES) {
      this.errorMessage.set('The squad icon must be an image of at most 5 MB.');
      return;
    }
    this.revokePreview();
    this.iconFile.set(file);
    this.iconPreview.set(URL.createObjectURL(file));
    this.errorMessage.set(null);
  }

  protected saveDraft(): void {
    const { name, description, primaryGameId, joinPolicy } = this.model();
    const draft: SquadDraft = {
      name,
      description,
      primaryGameId: primaryGameId ? Number(primaryGameId) : null,
      joinPolicy,
      channels: this.channels(),
      selectedChannels: this.selectedChannels(),
      invitees: this.invitees(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      this.notificationService.success('Draft saved.');
    } catch {
      this.notificationService.error('Could not save the draft on this device.');
    }
  }

  submit(): void {
    this.errorMessage.set(null);
    const { description, primaryGameId, joinPolicy } = this.model();
    const name = this.model().name.trim();
    if (!name) {
      this.errorMessage.set('Squad name is required.');
      return;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      this.errorMessage.set(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
      return;
    }

    // Keep chip order, not click order.
    const channelNames = this.channels().filter((c) => this.isSelected(c));
    const icon = this.iconFile();

    this.isSubmitting.set(true);
    this.squadService
      .create({
        name,
        description: description.trim() || undefined,
        joinPolicy,
        primaryGameId: primaryGameId ? Number(primaryGameId) : undefined,
        channelNames: channelNames.length > 0 ? channelNames : undefined,
        inviteUsernames: this.invitees().length > 0 ? this.invitees() : undefined,
      })
      .pipe(
        switchMap((squad): Observable<SquadModel> =>
          icon
            ? this.hubService.uploadIcon(squad.id, icon).pipe(
                map(({ iconUrl }) => ({ ...squad, iconUrl })),
                // The squad exists either way — a failed icon upload must not lose it.
                catchError(() => {
                  this.notificationService.error('Squad created, but the icon could not be uploaded.');
                  return of(squad);
                }),
              )
            : of(squad),
        ),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: (squad) => {
          this.clearDraft();
          this.created.emit(squad);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to create squad. Please try again.')),
      });
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        return;
      }
      const draft = JSON.parse(raw) as Partial<SquadDraft>;
      this.model.set({
        name: draft.name ?? '',
        description: draft.description ?? '',
        primaryGameId: draft.primaryGameId != null ? String(draft.primaryGameId) : '',
        joinPolicy: draft.joinPolicy ?? 'InviteOnly',
      });
      if (draft.channels?.length) {
        this.channels.set(draft.channels);
      }
      if (draft.selectedChannels) {
        this.selectedChannels.set(draft.selectedChannels);
      }
      this.invitees.set(draft.invitees ?? []);
    } catch {
      // Corrupt or blocked storage — start from a blank form.
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // nothing to clear
    }
  }

  private revokePreview(): void {
    const url = this.iconPreview();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
