import { Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadChannelModel, SquadLatestActivityModel, SquadModel } from '../../../../models/squad.model';
import { SquadSessionModel } from '../../../../models/squad-hub.model';
import { agoTr, clockTime } from '../squad-format';
import { SquadVoicePanel } from '../squad-voice-panel/squad-voice-panel';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';

/** Per device, like `arena.lastSquadId`. Absent = collapsed (the default). */
const SQUADS_OPEN_KEY = 'arena.squadSidebar.squadsOpen';
/** Small icons of the other squads on the collapsed "Squad'larım" row. */
const PEEK_COUNT = 3;

function readSquadsOpen(): boolean {
  try {
    return localStorage.getItem(SQUADS_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSquadsOpen(open: boolean): void {
  try {
    localStorage.setItem(SQUADS_OPEN_KEY, String(open));
  } catch {
    // Privacy modes: the section just starts collapsed next time.
  }
}

/**
 * The squad room's left sidebar, from `onSquad` (05-squad.html L22–76):
 * "Squad'larım" switcher cards (icon, name, green dot + "N online", LV chip,
 * activity line, "N yeni klip" / "N mesaj" badges when not selected), the
 * dashed "＋ Yeni squad" action, then the "Kanallar" list with unread pills.
 * Members also get "Sesli sohbet" under the channels — Discord-style voice
 * rows (live sessions list who's in) — and the voice panel pinned at the
 * bottom while they're in one.
 *
 * "Squad'larım" collapses (collapsed by default, remembered per device); the
 * collapsed row still shows the other squads' icons and their unread total.
 * On phones (squad-sidebar.mobile.scss) the sidebar is the room's ☰ drawer:
 * off-canvas until `drawerOpen`, with a close button and a way back to /squads.
 */
@Component({
  selector: 'app-squad-sidebar',
  imports: [ImgFallback, RouterLink, SquadVoicePanel],
  templateUrl: './squad-sidebar.html',
  styleUrls: ['./squad-sidebar.scss', './squad-sidebar.toggle.scss', './squad-sidebar.mobile.scss'],
  host: {
    '[class.drawer-open]': 'drawerOpen()',
  },
})
export class SquadSidebar {
  /** Phone only: the ☰ drawer is showing. Desktop ignores it (the sidebar is always there). */
  drawerOpen = input(false);
  squads = input.required<SquadModel[]>();
  activeSquadId = input.required<string>();
  channels = input.required<SquadChannelModel[]>();
  activeChannelId = input<string | null>(null);
  /** squadId → latest chat event (GET squads/mine/activity). */
  activity = input<Record<string, SquadLatestActivityModel>>({});
  /** Founder/admin only (server-enforced). */
  canAddChannel = input(false);
  /** Voice sessions are squad-only: active members see and join them. */
  canUseVoice = input(false);
  sessions = input<SquadSessionModel[]>([]);
  busySessionId = input<string | null>(null);
  currentUserId = input<string | undefined>(undefined);
  /** Founder/admin can start/end anyone's session; hosts can their own. */
  canManageSessions = input(false);

  channelPicked = output<string>();
  createSquad = output<void>();
  addChannel = output<void>();
  startSession = output<void>();
  sessionToggled = output<SquadSessionModel>();
  sessionStarted = output<SquadSessionModel>();
  sessionEnded = output<SquadSessionModel>();
  /** Phone drawer: ✕ pressed. */
  closeDrawer = output<void>();
  /** A squad card was tapped — the room closes the drawer while the route changes. */
  squadPicked = output<void>();

  protected readonly squadsOpen = signal(readSquadsOpen());

  /** Squads other than this room's, for the collapsed row. */
  protected readonly otherSquads = computed(() =>
    this.squads()
      .filter((squad) => squad.id !== this.activeSquadId())
      .slice(0, PEEK_COUNT),
  );

  /** New clips + unread messages across the other squads — the red count on the collapsed row. */
  protected readonly otherActivity = computed(() =>
    this.squads()
      .filter((squad) => squad.id !== this.activeSquadId())
      .reduce((sum, squad) => sum + squad.newClipCount + squad.unreadMessageCount, 0),
  );

  protected readonly otherActivityLabel = computed(() => `Diğer squad'larda ${this.otherActivity()} yeni`);

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    // Opening the phone drawer moves focus into it, so keyboard and screen reader users land there.
    afterRenderEffect(() => {
      if (this.drawerOpen()) {
        this.closeButton()?.nativeElement.focus();
      }
    });
  }

  protected toggleSquads(): void {
    const open = !this.squadsOpen();
    this.squadsOpen.set(open);
    writeSquadsOpen(open);
  }

  /** The live session you're in drives the bottom panel. */
  protected readonly connectedSession = computed(
    () => this.sessions().find((session) => session.isLive && session.isGoing) ?? null,
  );

  protected canManage(session: SquadSessionModel): boolean {
    return this.canManageSessions() || session.hostUserId === this.currentUserId();
  }

  /** "Ashfall · needs a healer" under the session name. */
  protected sessionSub(session: SquadSessionModel): string {
    return [session.gameName, session.note].filter((part) => !!part).join(' · ');
  }

  /** Scheduled sessions are at most a day out (server window): "21:00" / "yarın 10:00". */
  protected sessionWhen(session: SquadSessionModel): string {
    const start = new Date(session.startsAt);
    const now = new Date();
    const time = clockTime(session.startsAt);
    return start > now && start.toDateString() !== now.toDateString() ? `yarın ${time}` : time;
  }

  protected sessionLabel(session: SquadSessionModel): string {
    if (session.isLive) {
      return session.isGoing ? `${session.title} — sesten ayrıl` : `${session.title} — sese katıl`;
    }
    const when = this.sessionWhen(session);
    return session.isGoing ? `${session.title}, ${when} — katılımı geri al` : `${session.title}, ${when} — katılıyorum`;
  }

  /** "mavikedi az önce 3 klip paylaştı — Boss 7 denemeleri" */
  protected activityLine(squadId: string): string | null {
    const event = this.activity()[squadId];
    if (!event) {
      return null;
    }
    const when = agoTr(event.createdAt);
    if (event.kind === 'Event') {
      return `${event.username} ${when} ${event.body ?? ''} başarımını açtı`.replace(/\s+/g, ' ').trim();
    }
    if (event.kind === 'SharedPost') {
      const count = event.sharedCount > 1 ? `${event.sharedCount} ` : '';
      const noun = event.postType === 'Clip' ? 'klip' : event.postType === 'Screenshots' ? 'ekran görüntüsü' : 'gönderi';
      const caption = event.caption?.trim() ? ` — ${event.caption.trim()}` : '';
      return `${event.username} ${when} ${count}${noun} paylaştı${caption}`;
    }
    return `${event.username}: ${event.body ?? ''}`;
  }
}
