import { Service, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AppNotification, UnreadCounts } from '../../models/notification-center.model';
import { DirectMessage } from '../../models/direct-message.model';

export interface DirectMessagesReadEvent {
  conversationId: string;
  readerId: string;
  readAt: string;
}

export interface DirectMessageRemovedEvent {
  conversationId: string;
  messageId: string;
}

export interface DirectTypingEvent {
  conversationId: string;
  userId: string;
}

/** Throttle for outgoing typing pings — the server just relays them. */
const TYPING_THROTTLE_MS = 2500;

/**
 * SignalR client for `/api/hubs/me` (WebApi/Hubs/UserHub): the signed-in user's own channel, open on every page
 * (the squad hub only runs inside a squad room). Carries notifications, badge counts and DMs. The main layout
 * starts it through `NotificationCenterService.start()`; logout / an ended session disconnects. Realtime is
 * best-effort — every screen also works over plain HTTP.
 */
@Service()
export class UserRealtimeService {
  private authService = inject(AuthService);

  private connection: HubConnection | null = null;
  private lastTypingAt = 0;

  readonly isConnected = signal(false);

  private readonly notificationSubject = new Subject<AppNotification>();
  private readonly unreadCountSubject = new Subject<UnreadCounts>();
  private readonly dmCreatedSubject = new Subject<DirectMessage>();
  private readonly dmReadSubject = new Subject<DirectMessagesReadEvent>();
  private readonly dmRemovedSubject = new Subject<DirectMessageRemovedEvent>();
  private readonly dmTypingSubject = new Subject<DirectTypingEvent>();
  private readonly reconnectedSubject = new Subject<void>();

  readonly notification$: Observable<AppNotification> = this.notificationSubject.asObservable();
  readonly unreadCount$: Observable<UnreadCounts> = this.unreadCountSubject.asObservable();
  readonly dmCreated$: Observable<DirectMessage> = this.dmCreatedSubject.asObservable();
  readonly dmRead$: Observable<DirectMessagesReadEvent> = this.dmReadSubject.asObservable();
  readonly dmRemoved$: Observable<DirectMessageRemovedEvent> = this.dmRemovedSubject.asObservable();
  readonly dmTyping$: Observable<DirectTypingEvent> = this.dmTypingSubject.asObservable();
  /** After an automatic reconnect: events may have been missed, so listeners refetch. */
  readonly reconnected$: Observable<void> = this.reconnectedSubject.asObservable();

  constructor() {
    // Logout or an account switch: the connection still speaks for the previous user.
    this.authService.sessionEnded$.pipe(takeUntilDestroyed()).subscribe(() => void this.disconnect());
  }

  /** Opens the connection if it isn't open yet. Never throws. */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    const connection = new HubConnectionBuilder()
      .withUrl('/api/hubs/me', { accessTokenFactory: () => this.authService.getFreshToken() })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('notification', (n: AppNotification) => this.notificationSubject.next(n));
    connection.on('unreadCount', (c: UnreadCounts) => this.unreadCountSubject.next(c));
    connection.on('dmCreated', (m: DirectMessage) => this.dmCreatedSubject.next(m));
    connection.on('dmRead', (e: DirectMessagesReadEvent) => this.dmReadSubject.next(e));
    connection.on('dmRemoved', (e: DirectMessageRemovedEvent) => this.dmRemovedSubject.next(e));
    connection.on('dmTyping', (e: DirectTypingEvent) => this.dmTypingSubject.next(e));
    // Site-wide ban: the server ends every session and closes this connection right after.
    connection.on('sessionEnded', () => this.authService.expireSession());

    connection.onreconnecting(() => this.isConnected.set(false));
    connection.onreconnected(() => {
      this.isConnected.set(true);
      this.reconnectedSubject.next();
    });
    connection.onclose(() => this.isConnected.set(false));

    this.connection = connection;
    try {
      await connection.start();
      // disconnect() may have dropped this connection while it was starting.
      if (this.connection === connection) {
        this.isConnected.set(true);
      }
    } catch {
      // Offline or hub unavailable — forget it so the next connect() retries.
      if (this.connection === connection) {
        this.connection = null;
      }
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
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

  /** "… is typing" in a DM — throttled so a burst of keystrokes sends one ping. */
  typing(conversationId: string): void {
    const now = Date.now();
    if (now - this.lastTypingAt < TYPING_THROTTLE_MS || this.connection?.state !== HubConnectionState.Connected) {
      return;
    }
    this.lastTypingAt = now;
    this.connection.send('Typing', conversationId).catch(() => void 0);
  }
}
