import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SquadRealtimeService } from '../../../services/squad/squad-realtime.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import {
  SharedPostPreviewModel,
  SquadChannelModel,
  SquadGuideItemModel,
  SquadGuideModel,
  SquadMessageModel,
  SquadModel,
} from '../../../models/squad.model';
import { PostModel } from '../../../models/post.model';
import { SquadCreateSheet } from '../../../shared/squad-create-sheet/squad-create-sheet';
import { SquadSidebar } from './squad-sidebar/squad-sidebar';
import { SquadBanner } from './squad-banner/squad-banner';
import { ReactRequest, SquadChat } from './squad-chat/squad-chat';
import { SquadClips } from './squad-clips/squad-clips';
import { SquadScreens } from './squad-screens/squad-screens';
import { SquadPins } from './squad-pins/squad-pins';
import { SquadRail } from './squad-rail/squad-rail';
import { SquadSettingsSheet } from './squad-settings-sheet/squad-settings-sheet';
import { SquadPinnedSheet } from './squad-pinned-sheet/squad-pinned-sheet';
import { SquadClipViewer } from './squad-clip-viewer/squad-clip-viewer';
import { SquadGuideSheet } from './squad-guide-sheet/squad-guide-sheet';
import { HubSessionSheet } from '../hub/hub-session-sheet';
import { PHONE_QUERY, mediaQuery } from '../../../shared/media-query';
import { SquadRoomHeader } from './squad-room-header/squad-room-header';
import { SquadMembersSheet } from './squad-members-sheet/squad-members-sheet';
import { SquadMessageSheet } from './squad-message-sheet/squad-message-sheet';
import { SquadAddChannelSheet } from './squad-add-channel-sheet/squad-add-channel-sheet';
import { SquadComposerSheet } from './squad-composer-sheet/squad-composer-sheet';
import { OverlayStack } from '../../../shared/overlay/overlay-stack.service';
import { LoadError } from '../../../shared/load-error/load-error';
import { SquadRoomStore } from './state/squad-room.store';
import { SquadChatStore } from './state/squad-chat.store';
import { SquadLibraryStore } from './state/squad-library.store';
import { SquadSessionsStore } from './state/squad-sessions.store';
import { ReportService } from '../../../services/safety/report.service';

const HEARTBEAT_MS = 60_000;

type SquadTab = 'chat' | 'clips' | 'screens' | 'pinned';
type ComposerTarget = 'clip' | 'screenshots';

/**
 * Squad room — `onSquad` in 05-squad.html. Full-bleed under the topbar: 248px
 * sidebar, banner over the tabbed main column, 268px rail.
 *
 * State lives in four room-scoped stores (`state/`): the squad, roster and board
 * (`SquadRoomStore`), the chat with its realtime messages, reactions, pins and
 * typing (`SquadChatStore`), the library tabs (`SquadLibraryStore`) and voice
 * sessions (`SquadSessionsStore`). This component owns the layout state (tab,
 * sheets, phone drawer), navigation, and the presence heartbeat, which also
 * refreshes the sidebar's voice sessions ("Sesli sohbet").
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
    SquadAddChannelSheet,
    SquadComposerSheet,
    SquadClipViewer,
    SquadPinnedSheet,
    LoadError,
  ],
  providers: [SquadRoomStore, SquadLibraryStore, SquadChatStore, SquadSessionsStore],
  templateUrl: './squad-room.html',
  styleUrls: ['./squad-room.scss', './squad-room.mobile.scss'],
  host: {
    '(document:keydown.escape)': 'overlays.hasOpen() || isDrawerOpen.set(false)',
  },
})
export class SquadRoom {
  /** Page-level Escape stands down while a dialog is open — the dialog closes first. */
  protected readonly overlays = inject(OverlayStack);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private realtime = inject(SquadRealtimeService);
  private meService = inject(MeService);
  private notificationService = inject(NotificationService);
  private reportService = inject(ReportService);
  private destroyRef = inject(DestroyRef);

  protected readonly room = inject(SquadRoomStore);
  protected readonly chat = inject(SquadChatStore);
  protected readonly library = inject(SquadLibraryStore);
  protected readonly voice = inject(SquadSessionsStore);

  private readonly routeSquadId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly activeTab = signal<SquadTab>('chat');
  protected readonly isVoiceEnabled = this.voice.isEnabled;
  protected readonly currentAvatarUrl = computed(() => this.meService.me()?.avatarUrl ?? undefined);

  // ─── Phone layout ──────────────────────────────────────────────
  protected readonly isPhone = mediaQuery(PHONE_QUERY);
  /** ☰ drawer (the sidebar off-canvas). Closed until the header opens it. */
  protected readonly isDrawerOpen = signal(false);
  /** Roster + this week's board sheet (the desktop rail). */
  protected readonly isMembersOpen = signal(false);
  /** Long-pressed message → actions sheet; follows live updates (reactions, pins) of that message. */
  private readonly actionMessageId = signal<string | null>(null);
  protected readonly actionMessage = computed(
    () => this.chat.messages().find((message) => message.id === this.actionMessageId()) ?? null,
  );

  // ─── Sheets ────────────────────────────────────────────────────
  protected readonly isSettingsOpen = signal(false);
  protected readonly isCreateSquadOpen = signal(false);
  protected readonly isAddChannelOpen = signal(false);
  protected readonly isSessionSheetOpen = signal(false);
  protected readonly composerTarget = signal<ComposerTarget | null>(null);
  protected readonly guideSheet = signal<{ guide: SquadGuideModel | null } | null>(null);
  /** A squad clip playing in the room (Clips tab / guide item); `clips` is the list it steps through. */
  protected readonly clipViewer = signal<{ postId: string; clips: PostModel[] } | null>(null);
  protected readonly isPinsOpen = signal(false);

  constructor() {
    effect(() => {
      const id = this.routeSquadId();
      if (id) {
        untracked(() => this.openSquad(id));
      }
    });

    this.room.loadMySquads();

    // Removed, banned (or left from another tab): the server already dropped you from the room group.
    this.realtime.removedFromSquad$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId === this.room.squadId()) {
        this.notificationService.info("Artık bu squad'ın üyesi değilsin.");
        void this.router.navigate(['/squads']);
      }
    });

    // Presence: an HTTP ping right away (works without the hub), then the hub
    // heartbeat — or HTTP again if the hub is down — every minute. Presence pings
    // are background work: a missed one only delays the roster dot.
    this.meService.heartbeat().subscribe({ error: () => void 0 });
    const timer = setInterval(() => {
      this.chat.now.set(Date.now());
      if (this.realtime.isConnected()) {
        this.realtime.heartbeat();
      } else {
        this.meService.heartbeat().subscribe({ error: () => void 0 });
      }
      this.voice.load();
    }, HEARTBEAT_MS);
    const typingTick = setInterval(() => this.chat.now.set(Date.now()), 1_000);

    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearInterval(typingTick);
      void this.realtime.exit();
    });
  }

  selectTab(tab: SquadTab): void {
    this.activeTab.set(tab);
    if (tab === 'clips' && this.library.clipPosts().length === 0) {
      this.library.loadClips();
    } else if (tab === 'screens' && this.library.screenPosts().length === 0) {
      this.library.loadScreens();
    } else if (tab === 'pinned') {
      this.library.loadGuides();
    }
  }

  selectChannel(channelId: string): void {
    this.activeTab.set('chat');
    this.chat.selectChannel(channelId);
  }

  react(request: ReactRequest): void {
    this.chat.react(request.message, request.emoji);
  }

  /** SQUAD CLIP card's screenshots open the Screens tab (the chat plays clips in place itself). */
  openShared(shared: SharedPostPreviewModel): void {
    if (shared.postType === 'Clip') {
      this.openClip(shared.id);
    } else {
      this.selectTab('screens');
    }
  }

  /** "Push to main feed →": the post's page in the main app. */
  openPost(shared: SharedPostPreviewModel): void {
    void this.router.navigate(['/posts', shared.id]);
  }

  /** Plays a squad clip in a sheet over the room instead of leaving for the Clips page. */
  openClip(postId: string, clips: PostModel[] = []): void {
    this.clipViewer.set({ postId, clips });
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
    this.library.loadGuides();
    this.library.loadCounts();
  }

  // ─── Sheets ────────────────────────────────────────────────────
  openComposer(target: ComposerTarget): void {
    this.composerTarget.set(target);
  }

  /** The server drops a "shared a clip" row into chat — refresh the channel, the counts and the tab. */
  onPosted(post: PostModel): void {
    this.composerTarget.set(null);
    this.library.loadCounts();
    if (this.activeTab() === 'chat') {
      this.chat.reload();
    }
    const tabOpen =
      (post.postType === 'Clip' && this.activeTab() === 'clips') ||
      (post.postType === 'Screenshots' && this.activeTab() === 'screens');
    this.library.invalidate(post.postType, tabOpen);
    this.meService.refresh().subscribe({ error: () => void 0 });
  }

  openSettings(): void {
    this.isSettingsOpen.set(true);
  }

  onSettingsSaved(squad: SquadModel): void {
    this.room.replaceSquad(squad);
    this.isSettingsOpen.set(false);
  }

  onMembersChanged(): void {
    this.room.loadMembers();
    this.room.loadLeaderboard();
    this.room.reloadSquad();
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

  onSquadCreated(squad: SquadModel): void {
    this.isCreateSquadOpen.set(false);
    this.room.loadMySquads();
    this.router.navigate(['/squads', squad.id]);
  }

  openAddChannel(): void {
    this.isDrawerOpen.set(false);
    this.isAddChannelOpen.set(true);
  }

  onChannelCreated(channel: SquadChannelModel): void {
    this.room.squad.update((squad) => (squad ? { ...squad, channels: [...squad.channels, channel] } : squad));
    this.isAddChannelOpen.set(false);
    this.selectChannel(channel.id);
  }

  onSessionCreated(): void {
    this.isSessionSheetOpen.set(false);
    this.voice.load();
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

  openMessageActions(message: SquadMessageModel): void {
    this.actionMessageId.set(message.id);
  }

  closeMessageActions(): void {
    this.actionMessageId.set(null);
  }

  /** Captains and the author may unpin (server rule); any member may pin. */
  canUnpin(message: SquadMessageModel): boolean {
    return this.room.isCaptain() || message.userId === this.room.currentUserId();
  }

  reactFromSheet(message: SquadMessageModel, emoji: string): void {
    this.closeMessageActions();
    this.chat.react(message, emoji);
  }

  togglePinFromSheet(message: SquadMessageModel): void {
    this.closeMessageActions();
    this.chat.togglePin(message);
  }

  copyFromSheet(message: SquadMessageModel): void {
    this.closeMessageActions();
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

  reportFromSheet(message: SquadMessageModel): void {
    this.closeMessageActions();
    this.reportService.open({ type: 'SquadMessage', id: message.id, label: `@${message.username} · mesaj` });
  }

  viewProfileFromSheet(message: SquadMessageModel): void {
    this.closeMessageActions();
    this.router.navigate(['/profile', message.userId]);
  }

  protected retryLoad(): void {
    this.room.loadSquad((squad) => this.onSquadLoaded(squad));
  }

  // ─── Loading ───────────────────────────────────────────────────
  private openSquad(squadId: string): void {
    this.room.reset(squadId);
    this.chat.reset();
    this.library.reset();
    this.voice.reset();
    this.activeTab.set('chat');
    this.isSessionSheetOpen.set(false);
    this.isSettingsOpen.set(false);
    this.isAddChannelOpen.set(false);
    this.guideSheet.set(null);
    this.composerTarget.set(null);
    this.actionMessageId.set(null);
    this.room.loadSquad((squad) => this.onSquadLoaded(squad));
  }

  private onSquadLoaded(squad: SquadModel): void {
    const firstChannel = this.room.channels()[0];
    if (firstChannel) {
      this.selectChannel(firstChannel.id);
    }
    if (squad.currentUserRole) {
      this.library.loadCounts();
      this.voice.load();
      void this.realtime.enter(squad.id);
    }
  }
}
