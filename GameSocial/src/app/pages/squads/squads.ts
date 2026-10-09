import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormField, form } from '@angular/forms/signals';
import { Observable, Subscription, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, of, skip } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { SquadHubService } from '../../services/squad/squad-hub.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SquadModel } from '../../models/squad.model';
import {
  SquadDiscoverModel,
  SquadFriendOnlineModel,
  SquadInviteModel,
  SquadJoinResultModel,
  SquadWeeklyStatsModel,
} from '../../models/squad-hub.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { SquadCreateSheet } from '../../shared/squad-create-sheet/squad-create-sheet';
import { HubSquadCard } from './hub/hub-squad-card';
import { HubDiscoverCard } from './hub/hub-discover-card';
import { HubInviteSheet } from './hub/hub-invite-sheet';
import { HubPeekSheet } from './hub/hub-peek-sheet';
import { friendStatus, initialOf, isInVoice } from './hub/hub-format';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { PHONE_QUERY, mediaQuery } from '../../shared/media-query';
import { NgTemplateOutlet } from '@angular/common';

const BROWSE_PAGE = 12;

/**
 * `/squads` — the squad hub (expl.html 2a): page head with create/browse,
 * "Your squads", "Squads looking for you" and an aside with invites /
 * friends online / the squad XP explainer. Rooms live at `/squads/:id`,
 * and a squad's voice sessions live in its room sidebar.
 *
 * Phones (squads.mobile.scss, prototype "Squads · liste"): search full width,
 * create / browse side by side, the invite card above "Your squads" instead of
 * in the aside, and friends online as a sideways strip.
 */
@Component({
  selector: 'app-squads',
  imports: [ImgFallback, NgTemplateOutlet,
    FormField,
    RouterLink,
    SquadCreateSheet,
    HubSquadCard,
    HubDiscoverCard,
    HubInviteSheet,
    HubPeekSheet,
  ],
  templateUrl: './squads.html',
  styleUrls: ['./squads.scss', './squads.mobile.scss'],
})
export class Squads implements OnInit {
  /** Phones put the invite card above "Your squads"; desktop keeps it at the top of the aside. */
  protected readonly isPhone = mediaQuery(PHONE_QUERY);
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly stats = signal<Record<string, SquadWeeklyStatsModel>>({});
  protected readonly invites = signal<SquadInviteModel[]>([]);
  /** "Later" hides an invite for this visit without declining it. */
  protected readonly postponedInviteIds = signal<string[]>([]);
  protected readonly friends = signal<SquadFriendOnlineModel[]>([]);

  protected readonly discover = signal<SquadDiscoverModel | null>(null);
  protected readonly isDiscoverLoading = signal(false);
  protected readonly discoverError = signal(false);
  protected readonly requestedIds = signal<string[]>([]);
  protected readonly searchQuery = signal('');
  /** Single-field Signal Form over the hub search box; `searchQuery` stays the model. */
  protected readonly searchField = form(this.searchQuery);
  protected readonly searchTerm = computed(() => this.searchQuery().trim());
  protected readonly isBrowsingAll = signal(false);
  protected readonly discoverPage = signal(1);
  /** The in-flight discover call — a new search/browse cancels it so a slower old response can't win. */
  private discoverRequest?: Subscription;

  protected readonly busyId = signal<string | null>(null);

  protected readonly isCreateSheetOpen = signal(false);
  protected readonly inviteTarget = signal<SquadModel | null>(null);
  protected readonly peekTarget = signal<SquadModel | null>(null);

  protected readonly initialOf = initialOf;
  protected readonly friendStatus = friendStatus;
  protected readonly isInVoice = isInVoice;

  protected readonly subtitle = computed(() => {
    const count = this.mySquads().length;
    return count === 0
      ? 'Small groups that actually play together. Find one below or start your own.'
      : `Small groups that actually play together. You're in ${count}.`;
  });

  protected readonly visibleInvite = computed(
    () => this.invites().find((invite) => !this.postponedInviteIds().includes(invite.id)) ?? null,
  );

  /**
   * Discover never returns squads you're already in, so the search also
   * narrows "Your squads" (name, vibe or game) — otherwise searching for
   * your own squad finds nothing.
   */
  protected readonly visibleMySquads = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.mySquads();
    return this.mySquads().filter(
      (squad) =>
        squad.name.toLowerCase().includes(term) ||
        !!squad.description?.toLowerCase().includes(term) ||
        squad.games.some((game) => game.name.toLowerCase().includes(term)),
    );
  });

  /** Squad discovery only on demand — a search or "Browse all" (the "Squads looking for you" picks were dropped). */
  protected readonly showDiscover = computed(() => this.isBrowsingAll() || !!this.searchTerm());

  protected readonly discoverLabel = computed(() => (this.searchTerm() ? `Results for “${this.searchTerm()}”` : 'All squads'));

  protected readonly discoverNote = computed(() => {
    const result = this.discover();
    return result ? `${result.totalCount} ${result.totalCount === 1 ? 'squad' : 'squads'}` : '';
  });

  protected readonly canLoadMore = computed(() => {
    const result = this.discover();
    return !!result && result.items.length < result.totalCount;
  });

  constructor() {
    toObservable(this.searchTerm)
      .pipe(skip(1), debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.loadDiscover(true));
  }

  ngOnInit(): void {
    this.load();
    // `/squads?q=` — the global search's squad results open the hub on that search.
    const query = this.route.snapshot.queryParamMap.get('q')?.trim();
    if (query) {
      this.searchQuery.set(query);
      this.loadDiscover(true);
    }
  }

  protected load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    const soft = <T>(source: Observable<T>, fallback: T) => source.pipe(catchError(() => of(fallback)));

    forkJoin({
      mine: this.squadService.getMine(),
      stats: soft(this.hubService.getMyStats(), [] as SquadWeeklyStatsModel[]),
      invites: soft(this.hubService.getMyInvites(), [] as SquadInviteModel[]),
      friends: soft(this.hubService.getFriendsOnline(), [] as SquadFriendOnlineModel[]),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ mine, stats, invites, friends }) => {
          this.mySquads.set(mine);
          this.stats.set(Object.fromEntries(stats.map((s) => [s.squadId, s])));
          this.invites.set(invites);
          this.friends.set(friends);
        },
        error: (err) => this.loadError.set(extractApiErrorMessage(err, 'Could not load your squads.')),
      });

    if (this.showDiscover()) {
      this.loadDiscover(true);
    }
  }

  protected loadDiscover(reset: boolean): void {
    const term = this.searchTerm();
    const page = reset ? 1 : this.discoverPage() + 1;
    this.discoverRequest?.unsubscribe();
    if (!this.showDiscover()) {
      this.discover.set(null);
      this.isDiscoverLoading.set(false);
      return;
    }
    if (reset) {
      // Don't leave the previous list under the new "Results for …" heading while this loads.
      this.discover.set(null);
    }
    this.discoverError.set(false);
    this.isDiscoverLoading.set(true);
    this.discoverRequest = this.hubService
      .discover({
        q: term || undefined,
        page,
        pageSize: BROWSE_PAGE,
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
        error: () => this.discoverError.set(true),
      });
  }

  protected toggleBrowseAll(): void {
    this.isBrowsingAll.update((on) => !on);
    this.loadDiscover(true);
  }

  // ─── Actions ────────────────────────────────────────────────────────────
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
}
