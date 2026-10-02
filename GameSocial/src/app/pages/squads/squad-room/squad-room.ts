import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, finalize, map } from 'rxjs';
import { SquadService } from '../../../services/squad/squad.service';
import { SquadRoomService } from '../../../services/squad/squad-room.service';
import { SquadRealtimeService } from '../../../services/squad/squad-realtime.service';
import { PostService } from '../../../services/post/post.service';
import { GameService } from '../../../services/game/game.service';
import { AuthService } from '../../../services/auth/auth.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import {
  SharedPostPreviewModel,
  SquadGuideItemModel,
  SquadGuideModel,
  SquadLatestActivityModel,
  SquadLeaderboardEntryModel,
  SquadLibraryModel,
  SquadMemberModel,
  SquadMessageModel,
  SquadModel,
} from '../../../models/squad.model';
import { SquadSessionModel } from '../../../models/squad-hub.model';
import { SquadHubService } from '../../../services/squad/squad-hub.service';
import { PostModel } from '../../../models/post.model';
import { GameModel } from '../../../models/game.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SquadCreateSheet } from '../../../shared/squad-create-sheet/squad-create-sheet';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { PostComposer } from '../../feed/post-composer/post-composer';
import { writeLastSquadId } from '../last-squad-id';
import { SquadSidebar } from './squad-sidebar/squad-sidebar';
import { SquadBanner } from './squad-banner/squad-banner';
import { ReactRequest, SquadChat } from './squad-chat/squad-chat';
import { SquadClipSort, SquadClips } from './squad-clips/squad-clips';
import { SquadScreens } from './squad-screens/squad-screens';
import { SquadPins } from './squad-pins/squad-pins';
import { SquadRail } from './squad-rail/squad-rail';
import { SquadSettingsSheet } from './squad-settings-sheet/squad-settings-sheet';
import { SquadGuideSheet } from './squad-guide-sheet/squad-guide-sheet';
import { HubSessionSheet } from '../hub/hub-session-sheet';
import { environment } from '../../../../environments/environment';
import { PHONE_QUERY, mediaQuery } from '../../../shared/media-query';
import { SquadRoomHeader } from './squad-room-header/squad-room-header';
import { SquadMembersSheet } from './squad-members-sheet/squad-members-sheet';
import { SquadMessageSheet } from './squad-message-sheet/squad-message-sheet';

const MESSAGE_PAGE_SIZE = 50;
const POST_PAGE_SIZE = 12;
/** The mosaic shows five tiles but needs a few posts' worth of photos to fill them. */
const SCREEN_PAGE_SIZE = 8;
const HEARTBEAT_MS = 60_000;
const TYPING_TTL_MS = 4_000;

type SquadTab = 'chat' | 'clips' | 'screens' | 'pinned';
type ComposerTarget = 'clip' | 'screenshots';

const EMPTY_LIBRARY: SquadLibraryModel = { clipCount: 0, screenCount: 0, guideCount: 0, screenCountByGame: {} };

/**
 * Squad room — `onSquad` in 05-squad.html. Full-bleed under the topbar: 248px
 * sidebar, banner over the tabbed main column, 268px rail. Loads data,
 * composes the child sections and wires the SignalR room channel
 * (messages, reactions, guides, typing, presence) plus a presence heartbeat,
 * which also refreshes the sidebar's voice sessions ("Sesli sohbet").
 *
 * Phones (≤ 768px, prototype "Tavern Squads — Mobile"): the route is immersive
 * (no topbar / tab bar), the banner becomes `squad-room-header`, the sidebar
 * the ☰ drawer, the rail the members sheet, and long-pressing a message opens
 * the actions sheet.
 */
@Component({
  selector: 'app-squad-room',
  imports: [
    RouterLink,
    FormField,
    SquadSidebar,
    SquadBanner,
    SquadRoomHeader,
    SquadMembersSheet,
    SquadMessageSheet,
    SquadChat,
    SquadClips,
    SquadScreens,
    SquadPins,
    SquadRail,
    SquadSettingsSheet,
    SquadGuideSheet,
    HubSessionSheet,
    SquadCreateSheet,
    SheetModal,
    PostComposer,
  ],
  templateUrl: './squad-room.html',
  styleUrls: ['./squad-room.scss', './squad-room.mobile.scss'],
  host: {
    '(document:keydown.escape)': 'isDrawerOpen.set(false)',
  },
})
export class SquadRoom {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private squadService = inject(SquadService);
  private roomService = inject(SquadRoomService);
  private hubService = inject(SquadHubService);
  private realtime = inject(SquadRealtimeService);
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private meService = inject(MeService);
  private notificationService = inject(NotificationService);
  private destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);

  private readonly squadId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly squad = signal<SquadModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly activity = signal<Record<string, SquadLatestActivityModel>>({});
  protected readonly games = signal<GameModel[]>([]);
  protected readonly library = signal<SquadLibraryModel>(EMPTY_LIBRARY);

  protected readonly activeTab = signal<SquadTab>('chat');
  protected readonly activeChannelId = signal<string | null>(null);

  protected readonly isCaptain = computed(() => this.squad()?.currentUserRole === 'Captain');
  protected readonly isManager = computed(() => {
    const role = this.squad()?.currentUserRole;
    return role === 'Captain' || role === 'Admin';
  });
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
  /** channelId → (username → expiry timestamp). */
  private readonly typing = signal<Record<string, Record<string, number>>>({});
  private readonly now = signal(Date.now());

  // ─── Clips / Screens ───────────────────────────────────────────
  protected readonly clipPosts = signal<PostModel[]>([]);
  protected readonly isLoadingClips = signal(false);
  protected readonly clipGameId = signal<number | null>(null);
  protected readonly clipSort = signal<SquadClipSort>('new');

  protected readonly screenPosts = signal<PostModel[]>([]);
  protected readonly isLoadingScreens = signal(false);
  protected readonly screenGameId = signal<number | null>(null);

  // ─── Guides ────────────────────────────────────────────────────
  protected readonly guides = signal<SquadGuideModel[]>([]);
  protected readonly isLoadingGuides = signal(false);
  protected readonly guideSheet = signal<{ guide: SquadGuideModel | null } | null>(null);

  // ─── Roster / board ────────────────────────────────────────────
  protected readonly members = signal<SquadMemberModel[]>([]);
  protected readonly leaderboard = signal<SquadLeaderboardEntryModel[]>([]);
  protected readonly rosterError = signal<string | null>(null);
  protected readonly leaderboardError = signal<string | null>(null);

  // ─── Voice sessions ────────────────────────────────────────────
  /** Off (environment.features.squadVoice) until voice ships: no list, no polling. */
  protected readonly isVoiceEnabled = environment.features.squadVoice;
  protected readonly sessions = signal<SquadSessionModel[]>([]);
  protected readonly busySessionId = signal<string | null>(null);
  protected readonly isSessionSheetOpen = signal(false);

  // ─── Phone layout ──────────────────────────────────────────────
  protected readonly isPhone = mediaQuery(PHONE_QUERY);
  /** ☰ drawer (the sidebar off-canvas). Closed until the header opens it. */
  protected readonly isDrawerOpen = signal(false);
  /** Roster + this week's board sheet (the desktop rail). */
  protected readonly isMembersOpen = signal(false);
  /** Long-pressed message → actions sheet. */
  protected readonly actionMessage = signal<SquadMessageModel | null>(null);

  // ─── Sheets ────────────────────────────────────────────────────
  protected readonly isSettingsOpen = signal(false);
  protected readonly isCreateSquadOpen = signal(false);
  protected readonly composerTarget = signal<ComposerTarget | null>(null);
  protected readonly isAddChannelOpen = signal(false);
  protected readonly newChannelName = signal('');
  /** "Kanal ekle" sheet: single-field Signal Form; `newChannelName` stays the model. */
  protected readonly channelNameField = form(this.newChannelName, (path) => maxLength(path, 50));
  protected readonly isAddingChannel = signal(false);
  protected readonly addChannelError = signal<string | null>(null);

  protected readonly activeMembers = computed(() => this.members().filter((member) => member.status !== 'Pending'));
  protected readonly onlineCount = computed(() =>
    this.members().length === 0
      ? null
      : this.activeMembers().filter((member) => member.presence && member.presence !== 'offline').length,
  );

  /** userId → level, for the chat's LV chips. */
  protected readonly levelsByUserId = computed<Record<string, number>>(() => {
    const levels: Record<string, number> = {};
    for (const member of this.members()) {
      if (member.level) {
        levels[member.userId] = member.level;
      }
    }
    return levels;
  });

  protected readonly typingUsers = computed(() => {
    const channelId = this.activeChannelId();
    const now = this.now();
    const entries = channelId ? (this.typing()[channelId] ?? {}) : {};
    return Object.entries(entries)
      .filter(([, until]) => until > now)
      .map(([username]) => username);
  });

  protected readonly filteredScreenCount = computed(() => {
    const gameId = this.screenGameId();
    const library = this.library();
    return gameId === null ? library.screenCount : (library.screenCountByGame[String(gameId)] ?? 0);
  });

  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id);
  protected readonly currentAvatarUrl = computed(() => this.meService.me()?.avatarUrl ?? undefined);

  constructor() {
    effect(() => {
      const id = this.squadId();
      if (!id) {
        return;
      }
      this.resetForSquadChange();
      this.loadSquad(id);
    });

    this.loadMySquads();

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });

    this.wireRealtime();

    // Presence: an HTTP ping right away (works without the hub), then the hub
    // heartbeat — or HTTP again if the hub is down — every minute.
    this.meService.heartbeat().subscribe({ error: () => void 0 });
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.realtime.isConnected()) {
        this.realtime.heartbeat();
      } else {
        this.meService.heartbeat().subscribe({ error: () => void 0 });
      }
      this.loadSessions();
    }, HEARTBEAT_MS);
    const typingTick = setInterval(() => this.now.set(Date.now()), 1_000);

    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearInterval(typingTick);
      void this.realtime.exit();
    });
  }

  selectTab(tab: SquadTab): void {
    this.activeTab.set(tab);
    if (tab === 'clips' && this.clipPosts().length === 0) {
      this.loadClips();
    } else if (tab === 'screens' && this.screenPosts().length === 0) {
      this.loadScreens();
    } else if (tab === 'pinned') {
      this.loadGuides();
    }
  }

  selectChannel(channelId: string): void {
    this.activeTab.set('chat');
    if (channelId === this.activeChannelId()) {
      return;
    }
    this.activeChannelId.set(channelId);
    this.messages.set([]);
    this.messagesPage.set(1);
    this.hasMoreMessages.set(false);
    this.loadMessages(1);
    this.markRead(channelId);
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
        next: (message) => this.upsertMessage(message),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Mesaj gönderilemedi.')),
      });
  }

  react(request: ReactRequest): void {
    const { message, emoji } = request;
    this.roomService.toggleReaction(this.squadId(), message.channelId, message.id, emoji).subscribe({
      next: (updated) => this.upsertMessage(updated),
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Tepki verilemedi.')),
    });
  }

  onTyping(): void {
    const channelId = this.activeChannelId();
    if (channelId) {
      this.realtime.typing(this.squadId(), channelId);
    }
  }

  /** SQUAD CLIP card / "Push to main feed →": clips open on the Clips page, screenshots in the Screens tab. */
  openShared(shared: SharedPostPreviewModel): void {
    if (shared.postType === 'Clip') {
      this.openClip(shared.id);
    } else {
      this.selectTab('screens');
    }
  }

  openClip(postId: string): void {
    this.router.navigate(['/clips'], { queryParams: { clip: postId } });
  }

  openGuideItem(item: SquadGuideItemModel): void {
    this.guideSheet.set(null);
    if (item.postType === 'Clip') {
      this.openClip(item.postId);
    } else {
      this.selectTab('screens');
    }
  }

  onGuideSaved(): void {
    this.guideSheet.set(null);
    this.loadGuides();
    this.loadLibrary();
  }

  // ─── Sheets ────────────────────────────────────────────────────
  openComposer(target: ComposerTarget): void {
    this.composerTarget.set(target);
  }

  closeComposer(): void {
    this.composerTarget.set(null);
  }

  /** The server drops a "shared a clip" row into chat — refresh the channel, the counts and the tab. */
  onPosted(post: PostModel): void {
    this.composerTarget.set(null);
    this.loadLibrary();
    if (this.activeTab() === 'chat') {
      this.loadMessages(1);
    }
    if (post.postType === 'Clip') {
      this.clipPosts.set([]);
      if (this.activeTab() === 'clips') {
        this.loadClips();
      }
    } else if (post.postType === 'Screenshots') {
      this.screenPosts.set([]);
      if (this.activeTab() === 'screens') {
        this.loadScreens();
      }
    }
    this.meService.refresh().subscribe({ error: () => void 0 });
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
    this.mySquads.update((squads) => squads.map((item) => (item.id === squad.id ? squad : item)));
  }

  onMembersChanged(): void {
    this.loadMembers();
    this.loadLeaderboard();
    this.reloadSquad();
  }

  onLeftSquad(): void {
    this.isSettingsOpen.set(false);
    this.notificationService.success('Squad’dan ayrıldın.');
    this.router.navigate(['/squads']);
  }

  openCreateSquad(): void {
    this.isDrawerOpen.set(false);
    this.isCreateSquadOpen.set(true);
  }

  // ─── Phone: drawer, members sheet, message actions ─────────────

  /** Channel picked in the sidebar — on phones that also closes the drawer. */
  pickChannel(channelId: string): void {
    this.isDrawerOpen.set(false);
    this.selectChannel(channelId);
  }

  openMembersInvite(): void {
    this.isMembersOpen.set(false);
    this.openSettings();
  }

  /** Captains and the author may unpin (server rule); any member may pin. */
  canUnpin(message: SquadMessageModel): boolean {
    return this.isCaptain() || message.userId === this.currentUserId();
  }

  reactFromSheet(message: SquadMessageModel, emoji: string): void {
    this.actionMessage.set(null);
    this.react({ message, emoji });
  }

  togglePinFromSheet(message: SquadMessageModel): void {
    this.actionMessage.set(null);
    this.squadService.toggleMessagePin(this.squadId(), message.channelId, message.id).subscribe({
      next: (updated) => {
        this.upsertMessage(updated);
        this.notificationService.success(updated.isPinned ? 'Mesaj sabitlendi.' : 'Sabitleme kaldırıldı.');
      },
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Mesaj sabitlenemedi.')),
    });
  }

  copyFromSheet(message: SquadMessageModel): void {
    this.actionMessage.set(null);
    const text = message.body ?? '';
    if (!text || !navigator.clipboard) {
      this.notificationService.error('Metin kopyalanamadı.');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => this.notificationService.success('Metin kopyalandı.'),
      () => this.notificationService.error('Metin kopyalanamadı.'),
    );
  }

  viewProfileFromSheet(message: SquadMessageModel): void {
    this.actionMessage.set(null);
    this.router.navigate(['/profile', message.userId]);
  }

  closeCreateSquad(): void {
    this.isCreateSquadOpen.set(false);
  }

  onSquadCreated(squad: SquadModel): void {
    this.isCreateSquadOpen.set(false);
    this.loadMySquads();
    this.router.navigate(['/squads', squad.id]);
  }

  openAddChannel(): void {
    this.isDrawerOpen.set(false);
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
        error: (err) => this.addChannelError.set(extractApiErrorMessage(err, 'Kanal oluşturulamadı.')),
      });
  }

  // ─── Voice sessions ────────────────────────────────────────────
  openSessionSheet(): void {
    this.isSessionSheetOpen.set(true);
  }

  onSessionCreated(): void {
    this.isSessionSheetOpen.set(false);
    this.loadSessions();
  }

  /** Live: join / leave voice. Scheduled: "I'm in" RSVP. */
  toggleSession(session: SquadSessionModel): void {
    this.runSessionAction(session, this.hubService.toggleRsvp(session.id), 'Sesli sohbet güncellenemedi.');
  }

  /** Host or founder/admin: a scheduled session goes live now. */
  startSessionNow(session: SquadSessionModel): void {
    this.runSessionAction(session, this.hubService.goLive(session.id), 'Oturum başlatılamadı.');
  }

  /** Host or founder/admin: ends it for everyone. */
  endSession(session: SquadSessionModel): void {
    this.runSessionAction(session, this.hubService.endSession(session.id), 'Oturum bitirilemedi.');
  }

  private runSessionAction(session: SquadSessionModel, action: Observable<unknown>, fallback: string): void {
    if (this.busySessionId()) {
      return;
    }
    this.busySessionId.set(session.id);
    action.pipe(finalize(() => this.busySessionId.set(null))).subscribe({
      next: () => this.loadSessions(),
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, fallback)),
    });
  }

  // ─── Filters ───────────────────────────────────────────────────
  setClipGame(gameId: number | null): void {
    this.clipGameId.set(gameId);
    this.loadClips();
  }

  setClipSort(sort: SquadClipSort): void {
    this.clipSort.set(sort);
    this.loadClips();
  }

  setScreenGame(gameId: number | null): void {
    this.screenGameId.set(gameId);
    this.loadScreens();
  }

  reloadSquad(): void {
    this.squadService.getById(this.squadId()).subscribe({
      next: (squad) => {
        this.squad.set(squad);
        this.mySquads.update((squads) => squads.map((item) => (item.id === squad.id ? squad : item)));
      },
      error: () => void 0,
    });
  }

  // ─── Realtime ──────────────────────────────────────────────────
  private wireRealtime(): void {
    this.realtime.messageCreated$.pipe(takeUntilDestroyed()).subscribe((message) => {
      const squad = this.squad();
      if (!squad || !squad.channels.some((channel) => channel.id === message.channelId)) {
        return;
      }
      if (message.channelId === this.activeChannelId()) {
        this.upsertMessage(message);
        this.clearTyping(message.channelId, message.username);
        if (message.userId !== this.currentUserId()) {
          this.markRead(message.channelId);
        }
      } else if (message.userId !== this.currentUserId()) {
        this.squad.set({
          ...squad,
          channels: squad.channels.map((channel) =>
            channel.id === message.channelId ? { ...channel, unreadCount: channel.unreadCount + 1 } : channel,
          ),
        });
      }
      if (message.kind === 'SharedPost') {
        this.loadLibrary();
      }
    });

    this.realtime.reactionChanged$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.userId === this.currentUserId()) {
        return; // our own HTTP response already applied it
      }
      this.messages.update((messages) =>
        messages.map((message) => {
          if (message.id !== event.messageId) {
            return message;
          }
          const existing = message.reactions.find((reaction) => reaction.emoji === event.emoji);
          let reactions = message.reactions;
          if (existing) {
            const count = existing.count + (event.added ? 1 : -1);
            reactions =
              count <= 0
                ? reactions.filter((reaction) => reaction !== existing)
                : reactions.map((reaction) => (reaction === existing ? { ...reaction, count } : reaction));
          } else if (event.added) {
            reactions = [...reactions, { emoji: event.emoji, count: 1, reactedByCurrentUser: false }];
          }
          return { ...message, reactions };
        }),
      );
    });

    // Çıkarıldın / yasaklandın (ya da başka sekmeden ayrıldın): sunucu seni oda grubundan zaten attı.
    this.realtime.removedFromSquad$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId === this.squadId()) {
        this.notificationService.info("Artık bu squad'ın üyesi değilsin.");
        void this.router.navigate(['/squads']);
      }
    });

    this.realtime.guidesChanged$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId === this.squadId()) {
        this.loadGuides();
        this.loadLibrary();
      }
    });

    this.realtime.typing$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId !== this.squadId()) {
        return;
      }
      this.typing.update((all) => ({
        ...all,
        [event.channelId]: { ...(all[event.channelId] ?? {}), [event.username]: Date.now() + TYPING_TTL_MS },
      }));
      this.now.set(Date.now());
    });

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

  private clearTyping(channelId: string, username: string): void {
    this.typing.update((all) => {
      const channel = { ...(all[channelId] ?? {}) };
      delete channel[username];
      return { ...all, [channelId]: channel };
    });
  }

  private upsertMessage(message: SquadMessageModel): void {
    if (message.channelId !== this.activeChannelId()) {
      return;
    }
    this.messages.update((existing) =>
      existing.some((m) => m.id === message.id)
        ? existing.map((m) => (m.id === message.id ? message : m))
        : [...existing, message],
    );
  }

  /** Clears the channel's unread pill locally and server-side. */
  private markRead(channelId: string): void {
    const squad = this.squad();
    if (!squad || !this.isMember()) {
      return;
    }
    const channel = squad.channels.find((item) => item.id === channelId);
    if (channel && channel.unreadCount > 0) {
      this.squad.set({
        ...squad,
        unreadMessageCount: Math.max(0, squad.unreadMessageCount - channel.unreadCount),
        channels: squad.channels.map((item) => (item.id === channelId ? { ...item, unreadCount: 0 } : item)),
      });
    }
    this.roomService.markChannelRead(squad.id, channelId).subscribe({ error: () => void 0 });
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
    this.typing.set({});
    this.clipPosts.set([]);
    this.clipGameId.set(null);
    this.clipSort.set('new');
    this.screenPosts.set([]);
    this.screenGameId.set(null);
    this.guides.set([]);
    this.library.set(EMPTY_LIBRARY);
    this.members.set([]);
    this.leaderboard.set([]);
    this.rosterError.set(null);
    this.leaderboardError.set(null);
    this.sessions.set([]);
    this.busySessionId.set(null);
    this.isSessionSheetOpen.set(false);
    this.isSettingsOpen.set(false);
    this.guideSheet.set(null);
    this.composerTarget.set(null);
    this.closeAddChannel();
  }

  private loadMySquads(): void {
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
    this.roomService.getMySquadActivity().subscribe({
      next: (items) => this.activity.set(Object.fromEntries(items.map((item) => [item.squadId, item]))),
      error: () => void 0,
    });
  }

  private loadSquad(squadId: string): void {
    this.isLoading.set(true);
    this.squadService
      .getById(squadId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (squad) => {
          this.squad.set(squad);
          writeLastSquadId(squad.id);

          const firstChannel = [...squad.channels].sort((a, b) => a.sortOrder - b.sortOrder)[0];
          if (firstChannel) {
            this.selectChannel(firstChannel.id);
          }
          this.loadMembers();
          this.loadLeaderboard();
          if (squad.currentUserRole) {
            this.loadLibrary();
            this.loadSessions();
            void this.realtime.enter(squad.id);
          }
        },
        error: () => this.notFound.set(true),
      });
  }

  private loadLibrary(): void {
    this.roomService.getLibrary(this.squadId()).subscribe({
      next: (library) => this.library.set(library),
      error: () => void 0,
    });
  }

  /** Members only (server-enforced) — outsiders never see the voice list. */
  private loadSessions(): void {
    const squadId = this.squadId();
    if (!this.isVoiceEnabled || !squadId || !this.isMember()) {
      return;
    }
    this.hubService.getSquadSessions(squadId).subscribe({
      next: (sessions) => {
        if (squadId === this.squadId()) {
          this.sessions.set(sessions);
        }
      },
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
          if (channelId !== this.activeChannelId()) {
            return;
          }
          // Page 1 is the newest messages; each page comes back oldest-first, so older pages prepend.
          this.messages.update((existing) => (append ? [...result.items, ...existing] : result.items));
          this.messagesPage.set(result.page);
          this.hasMoreMessages.set(result.hasMore);
        },
        error: () => this.notificationService.error('Mesajlar yüklenemedi.'),
      });
  }

  private loadClips(): void {
    this.isLoadingClips.set(true);
    const top = this.clipSort() === 'top';
    this.postService
      .getPosts(1, POST_PAGE_SIZE, {
        squadId: this.squadId(),
        postType: 'Clip',
        gameId: this.clipGameId() ?? undefined,
        sort: top ? 'top' : 'new',
        window: top ? 'week' : undefined,
      })
      .pipe(finalize(() => this.isLoadingClips.set(false)))
      .subscribe({
        next: (result) => this.clipPosts.set(result.items),
        error: () => this.notificationService.error('Klipler yüklenemedi.'),
      });
  }

  private loadScreens(): void {
    this.isLoadingScreens.set(true);
    this.postService
      .getPosts(1, SCREEN_PAGE_SIZE, {
        squadId: this.squadId(),
        postType: 'Screenshots',
        gameId: this.screenGameId() ?? undefined,
      })
      .pipe(finalize(() => this.isLoadingScreens.set(false)))
      .subscribe({
        next: (result) => this.screenPosts.set(result.items),
        error: () => this.notificationService.error('Ekran görüntüleri yüklenemedi.'),
      });
  }

  private loadGuides(): void {
    this.isLoadingGuides.set(true);
    this.roomService
      .listGuides(this.squadId())
      .pipe(finalize(() => this.isLoadingGuides.set(false)))
      .subscribe({
        next: (guides) => this.guides.set(guides),
        error: () => this.notificationService.error('Guide’lar yüklenemedi.'),
      });
  }

  private loadMembers(): void {
    this.rosterError.set(null);
    this.squadService.listMembers(this.squadId()).subscribe({
      next: (members) => this.members.set(members),
      error: () => this.rosterError.set('Roster yüklenemedi.'),
    });
  }

  /** "This week's board" — falls back to the all-time board if the window param is rejected. */
  private loadLeaderboard(): void {
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
