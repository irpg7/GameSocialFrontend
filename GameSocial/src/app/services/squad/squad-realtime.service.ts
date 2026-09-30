import { Service, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { PresenceName, SquadMessageModel } from '../../models/squad.model';

export interface SquadReactionChangedEvent {
  squadId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  userId: string;
  added: boolean;
}

export interface SquadPinChangedEvent {
  squadId: string;
  channelId: string;
  messageId: string;
  isPinned: boolean;
}

export interface SquadTypingEvent {
  squadId: string;
  channelId: string;
  userId: string;
  username: string;
}

export interface SquadPresenceEvent {
  userId: string;
  presence: PresenceName;
  activity?: string | null;
  lastSeenAt?: string | null;
}

/** Throttle for outgoing typing pings — the server just relays them. */
const TYPING_THROTTLE_MS = 2500;

/**
 * SignalR client for `/api/hubs/squads` (WebApi/Hubs/SquadHub). One shared
 * connection; the squad room calls `enter(squadId)` / `exit()` and listens to
 * the event streams. Re-joins the current squad group after an automatic
 * reconnect. The JWT goes in the `access_token` query string because browsers
 * cannot set headers on WebSocket/SSE requests.
 */
@Service()
export class SquadRealtimeService {
  private authService = inject(AuthService);

  private connection: HubConnection | null = null;
  private starting: Promise<void> | null = null;
  private currentSquadId: string | null = null;
  private lastTypingAt = 0;

  readonly isConnected = signal(false);

  private readonly messageCreatedSubject = new Subject<SquadMessageModel>();
  private readonly reactionChangedSubject = new Subject<SquadReactionChangedEvent>();
  private readonly pinChangedSubject = new Subject<SquadPinChangedEvent>();
  private readonly guidesChangedSubject = new Subject<{ squadId: string }>();
  private readonly typingSubject = new Subject<SquadTypingEvent>();
  private readonly presenceSubject = new Subject<SquadPresenceEvent>();

  readonly messageCreated$: Observable<SquadMessageModel> = this.messageCreatedSubject.asObservable();
  readonly reactionChanged$: Observable<SquadReactionChangedEvent> = this.reactionChangedSubject.asObservable();
  readonly pinChanged$: Observable<SquadPinChangedEvent> = this.pinChangedSubject.asObservable();
  readonly guidesChanged$: Observable<{ squadId: string }> = this.guidesChangedSubject.asObservable();
  readonly typing$: Observable<SquadTypingEvent> = this.typingSubject.asObservable();
  readonly presence$: Observable<SquadPresenceEvent> = this.presenceSubject.asObservable();

  /** Joins the squad's group (leaving any previous one). Never throws — realtime is best-effort. */
  async enter(squadId: string): Promise<void> {
    if (this.currentSquadId && this.currentSquadId !== squadId) {
      await this.exit();
    }
    this.currentSquadId = squadId;
    try {
      await this.ensureStarted();
      await this.connection?.invoke('JoinSquad', squadId);
    } catch {
      // Offline or hub unavailable — the room still works over plain HTTP.
    }
  }

  async exit(): Promise<void> {
    const squadId = this.currentSquadId;
    this.currentSquadId = null;
    if (squadId && this.connection?.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveSquad', squadId);
      } catch {
        // ignore
      }
    }
  }

  /** "… yazıyor" — throttled so a burst of keystrokes sends one ping. */
  typing(squadId: string, channelId: string): void {
    const now = Date.now();
    if (now - this.lastTypingAt < TYPING_THROTTLE_MS || this.connection?.state !== HubConnectionState.Connected) {
      return;
    }
    this.lastTypingAt = now;
    this.connection.send('Typing', squadId, channelId).catch(() => void 0);
  }

  /** Presence ping while the room is open; also broadcasts the roster dot to squadmates. */
  heartbeat(activity?: string): void {
    if (this.connection?.state !== HubConnectionState.Connected) {
      return;
    }
    this.connection.send('Heartbeat', activity ?? null).catch(() => void 0);
  }

  private ensureStarted(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) {
      return Promise.resolve();
    }
    if (this.starting) {
      return this.starting;
    }

    if (!this.connection) {
      this.connection = new HubConnectionBuilder()
        .withUrl('/api/hubs/squads', { accessTokenFactory: () => this.authService.getToken() ?? '' })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('messageCreated', (message: SquadMessageModel) => this.messageCreatedSubject.next(message));
      this.connection.on('reactionChanged', (event: SquadReactionChangedEvent) => this.reactionChangedSubject.next(event));
      this.connection.on('pinChanged', (event: SquadPinChangedEvent) => this.pinChangedSubject.next(event));
      this.connection.on('guidesChanged', (event: { squadId: string }) => this.guidesChangedSubject.next(event));
      this.connection.on('typing', (event: SquadTypingEvent) => this.typingSubject.next(event));
      this.connection.on('presence', (event: SquadPresenceEvent) => this.presenceSubject.next(event));

      this.connection.onreconnecting(() => this.isConnected.set(false));
      this.connection.onreconnected(() => {
        this.isConnected.set(true);
        if (this.currentSquadId) {
          this.connection?.invoke('JoinSquad', this.currentSquadId).catch(() => void 0);
        }
      });
      this.connection.onclose(() => this.isConnected.set(false));
    }

    this.starting = this.connection
      .start()
      .then(() => this.isConnected.set(true))
      .finally(() => (this.starting = null));
    return this.starting;
  }
}
