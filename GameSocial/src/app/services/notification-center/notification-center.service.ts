import { Service, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { UserRealtimeService } from '../realtime/user-realtime.service';
import { PagedResult } from '../../models/paged-result.model';
import { AppNotification, UnreadCounts } from '../../models/notification-center.model';

const EMPTY_COUNTS: UnreadCounts = { notifications: 0, messages: 0 };

/**
 * In-app notifications (`/api/notifications`) and the topbar badges. `start()` (main layout) loads the counts
 * and opens the user hub; afterwards the hub's `unreadCount` keeps `counts()` current across tabs. Not to be
 * confused with `NotificationService`, which shows toasts.
 */
@Service()
export class NotificationCenterService {
  private http = inject(HttpClient);
  private realtime = inject(UserRealtimeService);

  private readonly countsState = signal<UnreadCounts>(EMPTY_COUNTS);
  readonly counts = this.countsState.asReadonly();

  /** New or updated (coalesced) notifications as they arrive. */
  readonly live$: Observable<AppNotification> = this.realtime.notification$;

  constructor() {
    this.realtime.unreadCount$.pipe(takeUntilDestroyed()).subscribe((counts) => this.countsState.set(counts));
    this.realtime.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.refreshCounts());
    inject(AuthService).sessionEnded$.pipe(takeUntilDestroyed()).subscribe(() => this.countsState.set(EMPTY_COUNTS));
  }

  start(): void {
    this.refreshCounts();
    void this.realtime.connect();
  }

  refreshCounts(): void {
    this.http.get<UnreadCounts>('/api/notifications/unread-counts').subscribe({
      next: (counts) => this.countsState.set(counts),
      error: () => void 0,
    });
  }

  list(page = 1, pageSize = 20, unreadOnly = false): Observable<PagedResult<AppNotification>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize).set('unreadOnly', unreadOnly);
    return this.http.get<PagedResult<AppNotification>>('/api/notifications', { params });
  }

  /** Optimistic: the badge drops at once; the hub sends the real count right after. */
  markRead(notification: AppNotification): Observable<void> {
    if (!notification.isRead) {
      this.countsState.update((c) => ({ ...c, notifications: Math.max(0, c.notifications - 1) }));
    }
    return this.http.post<void>(`/api/notifications/${notification.id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http
      .post<void>('/api/notifications/read-all', {})
      .pipe(tap(() => this.countsState.update((c) => ({ ...c, notifications: 0 }))));
  }
}
