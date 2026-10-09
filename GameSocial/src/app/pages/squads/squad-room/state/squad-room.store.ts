import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { SquadRoomService } from '../../../../services/squad/squad-room.service';
import { SquadRealtimeService } from '../../../../services/squad/squad-realtime.service';
import { AuthService } from '../../../../services/auth/auth.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import {
  SquadLatestActivityModel,
  SquadLeaderboardEntryModel,
  SquadMemberModel,
  SquadModel,
} from '../../../../models/squad.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';

/**
 * The open squad and everything about it that isn't a tab's content: the squad itself, your other
 * squads (sidebar), the game catalogue (settings / composer), roster and weekly board. Provided by
 * `SquadRoom` (one per room view); the chat, library and voice stores build on it.
 */
@Injectable()
export class SquadRoomStore {
  private squadService = inject(SquadService);
  private roomService = inject(SquadRoomService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private realtime = inject(SquadRealtimeService);

  /** Route id of the squad on screen. */
  readonly squadId = signal('');
  readonly squad = signal<SquadModel | null>(null);
  readonly isLoading = signal(true);
  readonly notFound = signal(false);
  /** Server error or offline while loading the squad — shown with a retry instead of "not found". */
  readonly loadError = signal<string | null>(null);

  readonly mySquads = signal<SquadModel[]>([]);
  readonly activity = signal<Record<string, SquadLatestActivityModel>>({});

  readonly members = signal<SquadMemberModel[]>([]);
  readonly leaderboard = signal<SquadLeaderboardEntryModel[]>([]);
  readonly rosterError = signal<string | null>(null);
  readonly leaderboardError = signal<string | null>(null);

  readonly currentUserId = computed(() => this.authService.currentUser()?.id);
  readonly isCaptain = computed(() => this.squad()?.currentUserRole === 'Captain');
  readonly isManager = computed(() => {
    const role = this.squad()?.currentUserRole;
    return role === 'Captain' || role === 'Admin';
  });
  readonly isMember = computed(() => this.squad()?.currentUserRole != null);
  readonly channels = computed(() => [...(this.squad()?.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));

  readonly activeMembers = computed(() => this.members().filter((member) => member.status !== 'Pending'));
  readonly onlineCount = computed(() =>
    this.members().length === 0
      ? null
      : this.activeMembers().filter((member) => member.presence && member.presence !== 'offline').length,
  );
  /** userId → level, for the chat's LV chips. */
  readonly levelsByUserId = computed<Record<string, number>>(() => {
    const levels: Record<string, number> = {};
    for (const member of this.members()) {
      if (member.level) {
        levels[member.userId] = member.level;
      }
    }
    return levels;
  });

  constructor() {
    // Roster dots follow squadmates' presence pings.
    this.realtime.presence$.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.members.update((members) =>
        members.map((member) =>
          member.userId === event.userId
            ? {
                ...member,
                presence: event.presence,
                currentActivity: event.presence === 'offline' ? undefined : (event.activity ?? member.currentActivity),
                lastSeenAt: event.lastSeenAt ?? member.lastSeenAt,
              }
            : member,
        ),
      );
    });
  }

  reset(squadId: string): void {
    this.squadId.set(squadId);
    this.squad.set(null);
    this.notFound.set(false);
    this.loadError.set(null);
    this.members.set([]);
    this.leaderboard.set([]);
    this.rosterError.set(null);
    this.leaderboardError.set(null);
  }

  /** Loads the squad; `onLoaded` runs the room's follow-up loads once it is on screen. */
  loadSquad(onLoaded: (squad: SquadModel) => void): void {
    const squadId = this.squadId();
    this.isLoading.set(true);
    this.loadError.set(null);
    this.squadService
      .getById(squadId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (squad) => {
          if (squadId !== this.squadId()) {
            return;
          }
          this.squad.set(squad);
          this.loadMembers();
          this.loadLeaderboard();
          onLoaded(squad);
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && [400, 403, 404].includes(err.status)) {
            this.notFound.set(true);
          } else {
            this.loadError.set(extractApiErrorMessage(err, 'Squad yüklenemedi.'));
          }
        },
      });
  }

  /** Re-reads the squad after a change made elsewhere (members, icon). */
  reloadSquad(): void {
    this.squadService.getById(this.squadId()).subscribe({
      next: (squad) => this.replaceSquad(squad),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Squad yenilenemedi.')),
    });
  }

  replaceSquad(squad: SquadModel): void {
    this.squad.set(squad);
    this.mySquads.update((squads) => squads.map((item) => (item.id === squad.id ? squad : item)));
  }

  loadMySquads(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, "Squad'ların yüklenemedi.")),
    });
    // Only the sidebar's "new activity" hints.
    this.roomService.getMySquadActivity().subscribe({
      next: (items) => this.activity.set(Object.fromEntries(items.map((item) => [item.squadId, item]))),
      error: () => void 0,
    });
  }

  loadMembers(): void {
    this.rosterError.set(null);
    this.squadService.listMembers(this.squadId()).subscribe({
      next: (members) => this.members.set(members),
      error: () => this.rosterError.set('Roster yüklenemedi.'),
    });
  }

  /** "This week's board" — falls back to the all-time board if the window param is rejected. */
  loadLeaderboard(): void {
    this.leaderboardError.set(null);
    this.roomService.getWeeklyBoard(this.squadId()).subscribe({
      next: (entries) => this.leaderboard.set(entries),
      error: () =>
        this.squadService.getLeaderboard(this.squadId()).subscribe({
          next: (entries) => this.leaderboard.set(entries),
          error: () => this.leaderboardError.set('Tablo yüklenemedi.'),
        }),
    });
  }
}
