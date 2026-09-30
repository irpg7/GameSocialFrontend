import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, of, skip } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { SquadHubService } from '../../services/squad/squad-hub.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SquadModel } from '../../models/squad.model';
import {
  SquadDiscoverModel,
  SquadFriendOnlineModel,
  SquadInviteModel,
  SquadJoinResultModel,
  SquadSessionModel,
  SquadWeeklyStatsModel,
} from '../../models/squad-hub.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { SquadCreateSheet } from '../../shared/squad-create-sheet/squad-create-sheet';
import { HubSessionCard } from './hub/hub-session-card';
import { HubSquadCard } from './hub/hub-squad-card';
import { HubDiscoverCard } from './hub/hub-discover-card';
import { HubVoiceBar } from './hub/hub-voice-bar';
import { HubInviteSheet } from './hub/hub-invite-sheet';
import { HubSessionSheet } from './hub/hub-session-sheet';
import { HubPeekSheet } from './hub/hub-peek-sheet';
import { friendStatus, initialOf } from './hub/hub-format';

const DISCOVER_PREVIEW = 3;
const BROWSE_PAGE = 12;

/**
 * `/squads` — the squad hub (expl.html 2a): page head with create/browse,
 * "Open sessions right now", "Your squads", "Squads looking for you", an
 * aside with invites / friends online / the squad XP explainer, and the
 * bottom voice bar for a live session. Rooms live at `/squads/:id`.
 */
@Component({
  selector: 'app-squads',
  imports: [
    FormsModule,
    RouterLink,
    SquadCreateSheet,
    HubSessionCard,
    HubSquadCard,
    HubDiscoverCard,
    HubVoiceBar,
    HubInviteSheet,
    HubSessionSheet,
    HubPeekSheet,
  ],
  templateUrl: './squads.html',
  styleUrl: './squads.scss',
})
export class Squads implements OnInit {
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly stats = signal<Record<string, SquadWeeklyStatsModel>>({});
  protected readonly sessions = signal<SquadSessionModel[]>([]);
  protected readonly invites = signal<SquadInviteModel[]>([]);
  /** "Later" hides an invite for this visit without declining it. */
  protected readonly postponedInviteIds = signal<string[]>([]);
  protected readonly friends = signal<SquadFriendOnlineModel[]>([]);

  protected readonly discover = signal<SquadDiscoverModel | null>(null);
  protected readonly isDiscoverLoading = signal(false);
  protected readonly requestedIds = signal<string[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly isBrowsingAll = signal(false);
  protected readonly discoverPage = signal(1);

  protected readonly busyId = signal<string | null>(null);

  protected readonly isCreateSheetOpen = signal(false);
  protected readonly inviteTarget = signal<SquadModel | null>(null);
  protected readonly peekTarget = signal<SquadModel | null>(null);
  protected readonly isSessionSheetOpen = signal(false);

  protected readonly initialOf = initialOf;
  protected readonly friendStatus = friendStatus;

  protected readonly subtitle = computed(() => {
    const count = this.mySquads().length;
    return count === 0
      ? 'Small groups that actually play together. Find one below or start your own.'
      : `Small groups that actually play together. You're in ${count}.`;
  });

  protected readonly visibleInvite = computed(
    () => this.invites().find((invite) => !this.postponedInviteIds().includes(invite.id)) ?? null,
  );

  /** The bar follows the live session you're in, else the first live one. */
  protected readonly voiceSession = computed(() => {
    const live = this.sessions().filter((s) => s.isLive);
    return live.find((s) => s.isGoing) ?? live[0] ?? null;
  });

  protected readonly discoverLabel = computed(() => {
    if (this.searchQuery().trim()) return `Results for “${this.searchQuery().trim()}”`;
    return this.isBrowsingAll() ? 'All squads' : 'Squads looking for you';
  });

  protected readonly discoverNote = computed(() => {
    const result = this.discover();
    if (!result) return '';
    if (this.searchQuery().trim() || this.isBrowsingAll()) {
      return `${result.totalCount} ${result.totalCount === 1 ? 'squad' : 'squads'}`;
    }
    if (result.basedOnGameName) {
      return result.basedOnHours ? `Based on ${result.basedOnGameName} · ${result.basedOnHours} h` : `Based on ${result.basedOnGameName}`;
    }
    return 'Popular right now';
  });

  protected readonly canLoadMore = computed(() => {
    const result = this.discover();
    return !!result && (this.isBrowsingAll() || !!this.searchQuery().trim()) && result.items.length < result.totalCount;
  });

  constructor() {
    toObservable(this.searchQuery)
      .pipe(skip(1), debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.loadDiscover(true));
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    const soft = <T>(source: Observable<T>, fallback: T) => source.pipe(catchError(() => of(fallback)));

    forkJoin({
      mine: this.squadService.getMine(),
      stats: soft(this.hubService.getMyStats(), [] as SquadWeeklyStatsModel[]),
      sessions: soft(this.hubService.getOpenSessions(), [] as SquadSessionModel[]),
      invites: soft(this.hubService.getMyInvites(), [] as SquadInviteModel[]),
      friends: soft(this.hubService.getFriendsOnline(), [] as SquadFriendOnlineModel[]),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ mine, stats, sessions, invites, friends }) => {
          this.mySquads.set(mine);
          this.stats.set(Object.fromEntries(stats.map((s) => [s.squadId, s])));
          this.sessions.set(sessions);
          this.invites.set(invites);
          this.friends.set(friends);
        },
        error: (err) => this.loadError.set(extractApiErrorMessage(err, 'Could not load your squads.')),
      });

    this.loadDiscover(true);
  }

  protected loadDiscover(reset: boolean): void {
    const all = this.isBrowsingAll() || !!this.searchQuery().trim();
    const page = reset ? 1 : this.discoverPage() + 1;
    this.isDiscoverLoading.set(true);
    this.hubService
      .discover({
        q: this.searchQuery().trim() || undefined,
        page,
        pageSize: all ? BROWSE_PAGE : DISCOVER_PREVIEW,
      })
      .pipe(finalize(() => this.isDiscoverLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.discoverPage.set(page);
          const previous = this.discover();
          this.discover.set(
            reset || !previous ? result : { ...result, items: [...previous.items, ...result.items] },
          );
          this.requestedIds.update((ids) => Array.from(new Set([...(reset ? [] : ids), ...result.requestedSquadIds])));
        },
        error: () => void 0,
      });
  }

  protected toggleBrowseAll(): void {
    this.isBrowsingAll.update((on) => !on);
    this.loadDiscover(true);
  }

  // ─── Actions ────────────────────────────────────────────────────────────
  protected toggleRsvp(session: SquadSessionModel): void {
    if (this.busyId()) return;
    this.busyId.set(session.id);
    this.hubService
      .toggleRsvp(session.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => this.reloadSessions(),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Could not update your RSVP.')),
      });
  }

  protected joinSquad(squad: SquadModel): void {
    if (this.busyId()) return;
    this.busyId.set(squad.id);
    this.hubService
      .join(squad.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (result) => this.afterJoin(result, squad.name),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Could not join the squad.')),
      });
  }

  protected acceptInvite(invite: SquadInviteModel): void {
    if (this.busyId()) return;
    this.busyId.set(invite.id);
    this.hubService
      .acceptInvite(invite.id)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (result) => {
          this.invites.update((list) => list.filter((i) => i.id !== invite.id));
          this.afterJoin(result, invite.squadName);
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Could not accept the invite.')),
      });
  }

  protected postponeInvite(invite: SquadInviteModel): void {
    this.postponedInviteIds.update((ids) => [...ids, invite.id]);
  }

  protected onCreated(squad: SquadModel): void {
    this.isCreateSheetOpen.set(false);
    this.router.navigate(['/squads', squad.id]);
  }

  protected onSessionCreated(): void {
    this.isSessionSheetOpen.set(false);
    this.reloadSessions();
  }

  private afterJoin(result: SquadJoinResultModel, squadName: string): void {
    this.peekTarget.set(null);
    if (result.status === 'Pending') {
      this.requestedIds.update((ids) => [...ids, result.squadId]);
      this.notificationService.success(`Request sent to ${squadName} — waiting for approval.`);
      return;
    }
    this.notificationService.success(`You joined ${squadName}.`);
    this.load();
  }

  private reloadSessions(): void {
    this.hubService.getOpenSessions().subscribe({
      next: (sessions) => this.sessions.set(sessions),
      error: () => void 0,
    });
  }
}
