import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { SquadService } from '../../../services/squad/squad.service';
import { PostService } from '../../../services/post/post.service';
import { GameService } from '../../../services/game/game.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import {
  PinnedSquadMessageModel,
  SquadLeaderboardEntryModel,
  SquadMemberModel,
  SquadMessageModel,
  SquadModel,
} from '../../../models/squad.model';
import { PostModel } from '../../../models/post.model';
import { GameModel } from '../../../models/game.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SquadCreateSheet } from '../../../shared/squad-create-sheet/squad-create-sheet';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { PostComposer } from '../../feed/post-composer/post-composer';
import { writeLastSquadId } from '../last-squad-id';
import { SquadSidebar } from './squad-sidebar/squad-sidebar';
import { SquadBanner } from './squad-banner/squad-banner';
import { SquadChat } from './squad-chat/squad-chat';
import { SquadClips } from './squad-clips/squad-clips';
import { SquadScreens } from './squad-screens/squad-screens';
import { SquadPins } from './squad-pins/squad-pins';
import { SquadRail, RosterEntry } from './squad-rail/squad-rail';
import { SquadSettingsSheet } from './squad-settings-sheet/squad-settings-sheet';

const MESSAGE_PAGE_SIZE = 50;
const POST_PAGE_SIZE = 12;

type SquadTab = 'chat' | 'clips' | 'screens' | 'pinned';
type ComposerTarget = 'clip' | 'screenshots';

/**
 * Squad room — Gamer Feed.dc.html's `onSquad` state. Runs full-bleed under the
 * topbar (the route is marked `data: { flush: true }`): a 248px sidebar, then a
 * banner over the tabbed main column, then a 268px rail.
 *
 * This component only loads data and composes the pieces; every section is its
 * own child component. It is also where the design's squad *switcher* lives
 * (in the sidebar), which is why there is no separate `/squads` list page —
 * `/squads` just redirects in here.
 */
@Component({
  selector: 'app-squad-room',
  imports: [
    RouterLink,
    FormsModule,
    SquadSidebar,
    SquadBanner,
    SquadChat,
    SquadClips,
    SquadScreens,
    SquadPins,
    SquadRail,
    SquadSettingsSheet,
    SquadCreateSheet,
    SheetModal,
    PostComposer,
  ],
  templateUrl: './squad-room.html',
  styleUrl: './squad-room.scss',
})
export class SquadRoom {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private squadService = inject(SquadService);
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private notificationService = inject(NotificationService);
  protected readonly authService = inject(AuthService);

  /**
   * Read reactively, not from a snapshot: switching squads in the sidebar is a
   * plain router navigation to a sibling `/squads/:id`, which reuses this same
   * component instance. The old code read `snapshot` once and then also called
   * a manual reload from the link's click handler, so every switch loaded the
   * squad twice.
   */
  private readonly squadId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly squad = signal<SquadModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly games = signal<GameModel[]>([]);

  protected readonly activeTab = signal<SquadTab>('chat');
  protected readonly activeChannelId = signal<string | null>(null);

  protected readonly isCaptain = computed(() => this.squad()?.currentUserRole === 'Captain');
  protected readonly isMember = computed(() => this.squad()?.currentUserRole != null);
  protected readonly channels = computed(() =>
    [...(this.squad()?.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  protected readonly activeChannel = computed(
    () => this.channels().find((channel) => channel.id === this.activeChannelId()) ?? null,
  );

  // ─── Chat ──────────────────────────────────────────────────────
  protected readonly messages = signal<SquadMessageModel[]>([]);
  protected readonly messagesPage = signal(1);
  protected readonly hasMoreMessages = signal(false);
  protected readonly isLoadingMessages = signal(false);
  protected readonly isSendingMessage = signal(false);

  // ─── Clips / Screens ───────────────────────────────────────────
  protected readonly clipPosts = signal<PostModel[]>([]);
  protected readonly clipCount = signal(0);
  protected readonly isLoadingClips = signal(false);
  protected readonly clipGameId = signal<number | null>(null);

  protected readonly screenPosts = signal<PostModel[]>([]);
  protected readonly screenCount = signal(0);
  protected readonly isLoadingScreens = signal(false);
  protected readonly screenGameId = signal<number | null>(null);

  // ─── Pinned ────────────────────────────────────────────────────
  protected readonly pins = signal<PinnedSquadMessageModel[]>([]);
  protected readonly isLoadingPins = signal(false);

  // ─── Roster / board ────────────────────────────────────────────
  protected readonly members = signal<SquadMemberModel[]>([]);
  protected readonly leaderboard = signal<SquadLeaderboardEntryModel[]>([]);
  protected readonly rosterError = signal<string | null>(null);
  protected readonly leaderboardError = signal<string | null>(null);

  // ─── Sheets ────────────────────────────────────────────────────
  protected readonly isSettingsOpen = signal(false);
  protected readonly isCreateSquadOpen = signal(false);
  protected readonly composerTarget = signal<ComposerTarget | null>(null);
  protected readonly isAddChannelOpen = signal(false);
  protected readonly newChannelName = signal('');
  protected readonly isAddingChannel = signal(false);
  protected readonly addChannelError = signal<string | null>(null);

  /**
   * The roster shows each member's level, which lives on the leaderboard
   * response rather than the members response — so the two are merged here
   * instead of having the rail hunt through both.
   */
  protected readonly rosterEntries = computed<RosterEntry[]>(() => {
    const standings = new Map(this.leaderboard().map((entry) => [entry.userId, entry]));
    return this.members().map((member) => {
      const standing = standings.get(member.userId);
      return {
        ...member,
        level: standing?.level ?? null,
        xp: standing?.xp ?? null,
      };
    });
  });

  /** userId → level, for the chat's LV chips. */
  protected readonly levelsByUserId = computed<Record<string, number>>(() => {
    const levels: Record<string, number> = {};
    for (const entry of this.leaderboard()) {
      levels[entry.userId] = entry.level;
    }
    return levels;
  });

  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id);
  protected readonly currentUsername = computed(() => this.authService.currentUser()?.username);

  constructor() {
    // Re-runs on every squad id change, including sidebar switches within this
    // same component instance.
    effect(() => {
      const id = this.squadId();
      if (!id) {
        return;
      }
      this.resetForSquadChange();
      this.loadSquad(id);
    });

    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
  }

  selectTab(tab: SquadTab): void {
    this.activeTab.set(tab);
    if (tab === 'clips' && this.clipPosts().length === 0) {
      this.loadClips();
    } else if (tab === 'screens' && this.screenPosts().length === 0) {
      this.loadScreens();
    } else if (tab === 'pinned' && this.pins().length === 0) {
      this.loadPins();
    }
  }

  selectChannel(channelId: string): void {
    if (channelId === this.activeChannelId()) {
      return;
    }
    this.activeChannelId.set(channelId);
    this.messages.set([]);
    this.messagesPage.set(1);
    this.hasMoreMessages.set(false);
    this.loadMessages(1);
  }

  /** From the Pinned tab: jump to the pin's channel in the Chat tab. */
  openPin(pin: PinnedSquadMessageModel): void {
    this.activeTab.set('chat');
    this.selectChannel(pin.channelId);
  }

  loadEarlierMessages(): void {
    this.loadMessages(this.messagesPage() + 1, true);
  }

  sendMessage(body: string): void {
    const channelId = this.activeChannelId();
    const id = this.squadId();
    if (!body || channelId === null || this.isSendingMessage()) {
      return;
    }
    this.isSendingMessage.set(true);
    this.squadService
      .sendMessage(id, channelId, body)
      .pipe(finalize(() => this.isSendingMessage.set(false)))
      .subscribe({
        next: (message) => this.messages.update((existing) => [...existing, message]),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to send message.')),
      });
  }

  /**
   * Uses the message's own `channelId` rather than the active channel, since
   * this is also reachable from a pin that lives in another channel.
   * Pinning is open to any member; unpinning is captain-or-author server-side,
   * so a rejected unpin surfaces the server's reason.
   */
  togglePin(message: SquadMessageModel): void {
    this.squadService.toggleMessagePin(this.squadId(), message.channelId, message.id).subscribe({
      next: (updated) => {
        this.messages.update((existing) => existing.map((m) => (m.id === updated.id ? updated : m)));
        this.pins.update((existing) => existing.filter((pin) => pin.id !== updated.id || updated.isPinned));
        this.squad.update((squad) =>
          squad
            ? { ...squad, pinnedMessageCount: Math.max(0, squad.pinnedMessageCount + (updated.isPinned ? 1 : -1)) }
            : squad,
        );
        // The pinned list is cheap and now authoritative — refetch it.
        if (this.activeTab() === 'pinned' || updated.isPinned) {
          this.loadPins();
        }
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update pin.')),
    });
  }

  // ─── Sheets ────────────────────────────────────────────────────
  openComposer(target: ComposerTarget): void {
    this.composerTarget.set(target);
  }

  closeComposer(): void {
    this.composerTarget.set(null);
  }

  onPosted(post: PostModel): void {
    this.composerTarget.set(null);
    // Land the user on the tab their new post belongs to, and refresh it.
    if (post.postType === 'Clip') {
      this.activeTab.set('clips');
      this.loadClips();
    } else if (post.postType === 'Screenshots') {
      this.activeTab.set('screens');
      this.loadScreens();
    }
  }

  openSettings(): void {
    this.isSettingsOpen.set(true);
  }

  closeSettings(): void {
    this.isSettingsOpen.set(false);
  }

  onSettingsSaved(squad: SquadModel): void {
    this.squad.set(squad);
    this.isSettingsOpen.set(false);
    // The sidebar card shows the name/game, so keep the switcher in step.
    this.mySquads.update((squads) => squads.map((item) => (item.id === squad.id ? squad : item)));
  }

  onMembersChanged(): void {
    this.loadMembers();
    this.loadLeaderboard();
    this.reloadSquadCounts();
  }

  onLeftSquad(): void {
    this.isSettingsOpen.set(false);
    this.notificationService.success('You left the squad.');
    // `/squads` re-resolves which room to open, or shows the welcome state.
    this.router.navigate(['/squads']);
  }

  openCreateSquad(): void {
    this.isCreateSquadOpen.set(true);
  }

  closeCreateSquad(): void {
    this.isCreateSquadOpen.set(false);
  }

  onSquadCreated(squad: SquadModel): void {
    this.isCreateSquadOpen.set(false);
    this.router.navigate(['/squads', squad.id]);
  }

  openAddChannel(): void {
    this.isAddChannelOpen.set(true);
    this.addChannelError.set(null);
  }

  closeAddChannel(): void {
    this.isAddChannelOpen.set(false);
    this.newChannelName.set('');
    this.addChannelError.set(null);
  }

  addChannel(): void {
    const name = this.newChannelName().trim();
    if (!name || this.isAddingChannel()) {
      return;
    }
    this.addChannelError.set(null);
    this.isAddingChannel.set(true);
    this.squadService
      .createChannel(this.squadId(), name)
      .pipe(finalize(() => this.isAddingChannel.set(false)))
      .subscribe({
        next: (channel) => {
          this.squad.update((squad) => (squad ? { ...squad, channels: [...squad.channels, channel] } : squad));
          this.closeAddChannel();
          this.selectChannel(channel.id);
        },
        error: (err) => this.addChannelError.set(extractApiErrorMessage(err, 'Failed to create channel.')),
      });
  }

  // ─── Filters ───────────────────────────────────────────────────
  setClipGame(gameId: number | null): void {
    this.clipGameId.set(gameId);
    this.loadClips();
  }

  setScreenGame(gameId: number | null): void {
    this.screenGameId.set(gameId);
    this.loadScreens();
  }

  /** Opening a clip from the grid hands off to the dedicated Clips page. */
  openClip(post: PostModel): void {
    this.router.navigate(['/clips'], { queryParams: { post: post.id } });
  }

  // ─── Loading ───────────────────────────────────────────────────
  private resetForSquadChange(): void {
    this.squad.set(null);
    this.notFound.set(false);
    this.activeTab.set('chat');
    this.activeChannelId.set(null);
    this.messages.set([]);
    this.messagesPage.set(1);
    this.hasMoreMessages.set(false);
    this.clipPosts.set([]);
    this.clipCount.set(0);
    this.clipGameId.set(null);
    this.screenPosts.set([]);
    this.screenCount.set(0);
    this.screenGameId.set(null);
    this.pins.set([]);
    this.members.set([]);
    this.leaderboard.set([]);
    this.rosterError.set(null);
    this.leaderboardError.set(null);
    this.isSettingsOpen.set(false);
    this.composerTarget.set(null);
    this.closeAddChannel();
  }

  private loadSquad(squadId: string): void {
    this.isLoading.set(true);
    this.squadService
      .getById(squadId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (squad) => {
          this.squad.set(squad);
          // Lets `/squads` reopen this room next time instead of the first squad.
          writeLastSquadId(squad.id);

          const firstChannel = [...squad.channels].sort((a, b) => a.sortOrder - b.sortOrder)[0];
          if (firstChannel) {
            this.selectChannel(firstChannel.id);
          }
          this.loadMembers();
          this.loadLeaderboard();
          this.loadTabCounts();
        },
        error: () => this.notFound.set(true),
      });
  }

  /**
   * The tab row shows clip/screen counts. `pageSize=1` is enough — only
   * `totalCount` is wanted, so this never pulls a page of posts.
   */
  private loadTabCounts(): void {
    const squadId = this.squadId();
    this.postService.getPosts(1, 1, { squadId, postType: 'Clip' }).subscribe({
      next: (result) => this.clipCount.set(result.totalCount),
      error: () => void 0,
    });
    this.postService.getPosts(1, 1, { squadId, postType: 'Screenshots' }).subscribe({
      next: (result) => this.screenCount.set(result.totalCount),
      error: () => void 0,
    });
  }

  /** After a membership change the squad's counts are stale. */
  private reloadSquadCounts(): void {
    this.squadService.getById(this.squadId()).subscribe({
      next: (squad) => this.squad.set(squad),
      error: () => void 0,
    });
  }

  private loadMessages(page: number, append = false): void {
    const channelId = this.activeChannelId();
    if (channelId === null) {
      return;
    }
    this.isLoadingMessages.set(true);
    this.squadService
      .listMessages(this.squadId(), channelId, page, MESSAGE_PAGE_SIZE)
      .pipe(finalize(() => this.isLoadingMessages.set(false)))
      .subscribe({
        next: (result) => {
          // Messages come back oldest-first, so an older page prepends.
          this.messages.update((existing) => (append ? [...result.items, ...existing] : result.items));
          this.messagesPage.set(result.page);
          this.hasMoreMessages.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load messages.'),
      });
  }

  private loadClips(): void {
    this.isLoadingClips.set(true);
    this.postService
      .getPosts(1, POST_PAGE_SIZE, {
        squadId: this.squadId(),
        postType: 'Clip',
        gameId: this.clipGameId() ?? undefined,
      })
      .pipe(finalize(() => this.isLoadingClips.set(false)))
      .subscribe({
        next: (result) => {
          this.clipPosts.set(result.items);
          // Unfiltered view doubles as the tab's count.
          if (this.clipGameId() === null) {
            this.clipCount.set(result.totalCount);
          }
        },
        error: () => this.notificationService.error('Failed to load clips.'),
      });
  }

  private loadScreens(): void {
    this.isLoadingScreens.set(true);
    this.postService
      .getPosts(1, POST_PAGE_SIZE, {
        squadId: this.squadId(),
        postType: 'Screenshots',
        gameId: this.screenGameId() ?? undefined,
      })
      .pipe(finalize(() => this.isLoadingScreens.set(false)))
      .subscribe({
        next: (result) => {
          this.screenPosts.set(result.items);
          if (this.screenGameId() === null) {
            this.screenCount.set(result.totalCount);
          }
        },
        error: () => this.notificationService.error('Failed to load screenshots.'),
      });
  }

  /** One request across every channel, via GET /squads/{id}/pins. */
  private loadPins(): void {
    this.isLoadingPins.set(true);
    this.squadService
      .listPins(this.squadId())
      .pipe(finalize(() => this.isLoadingPins.set(false)))
      .subscribe({
        next: (result) => this.pins.set(result.items),
        error: () => this.notificationService.error('Failed to load pinned messages.'),
      });
  }

  private loadMembers(): void {
    this.rosterError.set(null);
    this.squadService.listMembers(this.squadId()).subscribe({
      next: (members) => this.members.set(members),
      // Previously swallowed, which left the roster panel silently blank.
      error: () => this.rosterError.set('Could not load the roster.'),
    });
  }

  private loadLeaderboard(): void {
    this.leaderboardError.set(null);
    this.squadService.getLeaderboard(this.squadId()).subscribe({
      next: (entries) => this.leaderboard.set(entries),
      error: () => this.leaderboardError.set('Could not load the board.'),
    });
  }
}
