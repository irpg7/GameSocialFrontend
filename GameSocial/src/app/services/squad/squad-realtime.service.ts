import { Service, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

export interface SquadMessageRemovedEvent {
  squadId: string;
  channelId: string;
  messageId: string;
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
  private readonly removedSubject = new Subject<{ squadId: string }>();
  private readonly messageRemovedSubject = new Subject<SquadMessageRemovedEvent>();

  readonly messageCreated$: Observable<SquadMessageModel> = this.messageCreatedSubject.asObservable();
  readonly reactionChanged$: Observable<SquadReactionChangedEvent> = this.reactionChangedSubject.asObservable();
  readonly pinChanged$: Observable<SquadPinChangedEvent> = this.pinChangedSubject.asObservable();
  readonly guidesChanged$: Observable<{ squadId: string }> = this.guidesChangedSubject.asObservable();
  readonly typing$: Observable<SquadTypingEvent> = this.typingSubject.asObservable();
  readonly presence$: Observable<SquadPresenceEvent> = this.presenceSubject.asObservable();
  /** You were removed, banned or left from another tab — the server already dropped you from the room group. */
  readonly removedFromSquad$: Observable<{ squadId: string }> = this.removedSubject.asObservable();
  /** A moderator removed a message — drop it from the open channel. */
  readonly messageRemoved$: Observable<SquadMessageRemovedEvent> = this.messageRemovedSubject.asObservable();

  constructor() {
    // Logout or an account switch: the hub connection still speaks for the previous user.
    this.authService.sessionEnded$.pipe(takeUntilDestroyed()).subscribe(() => void this.disconnect());
  }

  /** Joins the squad's group (leaving any previous one). Never throws — realtime is best-effort. */
  async enter(squadId: string): Promise<void> {
    if (this.currentSquadId && this.currentSquadId !== squadId) {
      await this.exit();
    }
    this.currentSquadId = squadId;
    try {
      await this.ensureStarted();
      // The user may have moved to another squad (or left the room) while the connection was starting:
      // joining now would keep them in this squad's group, receiving its events and showing as present.
      if (this.currentSquadId !== squadId) {
        return;
      }
      await this.connection?.invoke('JoinSquad', squadId);
      if (this.currentSquadId !== squadId) {
        await this.connection?.invoke('LeaveSquad', squadId);
      }
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

  /**
   * Stops the hub connection and forgets it, so the next `enter()` builds a fresh one with the
   * current user's token. Event streams stay open — subscribers simply hear nothing until then.
   */
  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.starting = null;
    this.currentSquadId = null;
    this.lastTypingAt = 0;
    this.isConnected.set(false);
    if (connection) {
      try {
        await connection.stop();
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
        .withUrl('/api/hubs/squads', { accessTokenFactory: () => this.authService.getFreshToken() })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('messageCreated', (message: SquadMessageModel) => this.messageCreatedSubject.next(message));
      this.connection.on('reactionChanged', (event: SquadReactionChangedEvent) => this.reactionChangedSubject.next(event));
      this.connection.on('pinChanged', (event: SquadPinChangedEvent) => this.pinChangedSubject.next(event));
      this.connection.on('guidesChanged', (event: { squadId: string }) => this.guidesChangedSubject.next(event));
      this.connection.on('typing', (event: SquadTypingEvent) => this.typingSubject.next(event));
      this.connection.on('presence', (event: SquadPresenceEvent) => this.presenceSubject.next(event));
      this.connection.on('removedFromSquad', (event: { squadId: string }) => this.removedSubject.next(event));
      this.connection.on('messageRemoved', (event: SquadMessageRemovedEvent) => this.messageRemovedSubject.next(event));
      // Site-wide ban: the server ends every session and closes this connection right after.
      this.connection.on('sessionEnded', () => this.authService.expireSession());

      this.connection.onreconnecting(() => this.isConnected.set(false));
      this.connection.onreconnected(() => {
        this.isConnected.set(true);
        if (this.currentSquadId) {
          this.connection?.invoke('JoinSquad', this.currentSquadId).catch(() => void 0);
        }
      });
      this.connection.onclose(() => this.isConnected.set(false));
    }

    const connection = this.connection;
    const starting = connection
      .start()
      .then(() => {
        // disconnect() may have dropped this connection while it was starting.
        if (this.connection === connection) {
          this.isConnected.set(true);
        }
      })
      .finally(() => {
        if (this.starting === starting) {
          this.starting = null;
        }
      });
    this.starting = starting;
    return starting;
  }
}
