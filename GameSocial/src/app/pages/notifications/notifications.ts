import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationCenterService } from '../../services/notification-center/notification-center.service';
import { NotificationService } from '../../services/notification/notification.service';
import { AppNotification } from '../../models/notification-center.model';
import { NotificationItem } from '../../shared/notification-item/notification-item';
import { notificationLink } from '../../shared/notification-item/notification-text';
import { LoadError } from '../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../shared/api-error.util';

const PAGE_SIZE = 20;

/** `/notifications` — every notification, newest first, paged with "Load more"; new ones arrive live. */
@Component({
  selector: 'app-notifications',
  imports: [NotificationItem, LoadError],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class Notifications {
  protected readonly center = inject(NotificationCenterService);
  private toast = inject(NotificationService);
  private router = inject(Router);

  protected readonly unreadOnly = signal(false);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  private page = 1;
  private request: Subscription | null = null;

  constructor() {
    this.load(true);
    this.center.live$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((n) => {
      this.items.update((list) => [n, ...list.filter((x) => x.id !== n.id)]);
    });
  }

  protected setUnreadOnly(value: boolean): void {
    if (this.unreadOnly() !== value) {
      this.unreadOnly.set(value);
      this.load(true);
    }
  }

  protected load(reset: boolean): void {
    // A filter change cancels the older request so it can't overwrite the new list.
    this.request?.unsubscribe();
    if (reset) {
      this.page = 1;
      this.items.set([]);
    }
    this.isLoading.set(true);
    this.loadError.set(null);
    this.request = this.center.list(this.page, PAGE_SIZE, this.unreadOnly()).subscribe({
      next: (page) => {
        this.items.update((list) => [...list, ...page.items.filter((n) => !list.some((x) => x.id === n.id))]);
        this.hasMore.set(page.hasMore);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.loadError.set(extractApiErrorMessage(err, 'Could not load notifications.'));
      },
    });
  }

  protected loadMore(): void {
    this.page += 1;
    this.load(false);
  }

  protected open(n: AppNotification): void {
    if (!n.isRead) {
      this.center.markRead(n).subscribe({ error: () => void 0 });
      this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    const link = notificationLink(n);
    if (link) {
      void this.router.navigate(link);
    }
  }

  protected markAllRead(): void {
    this.center.markAllRead().subscribe({
      next: () => this.items.update((list) => (this.unreadOnly() ? [] : list.map((x) => ({ ...x, isRead: true })))),
      error: (err: unknown) => this.toast.error(extractApiErrorMessage(err, 'Could not mark notifications as read.')),
    });
  }
}
