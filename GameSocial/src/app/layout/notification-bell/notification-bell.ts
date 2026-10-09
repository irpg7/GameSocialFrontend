import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationCenterService } from '../../services/notification-center/notification-center.service';
import { OverlayStack } from '../../shared/overlay/overlay-stack.service';
import { AppNotification } from '../../models/notification-center.model';
import { NotificationItem } from '../../shared/notification-item/notification-item';
import { notificationLink } from '../../shared/notification-item/notification-text';

const PANEL_SIZE = 8;

/**
 * Topbar bell: unread badge + a dropdown with the latest notifications (live while open). "See all" opens
 * `/notifications`. Clicking a row marks it read and follows its link.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [NotificationItem, RouterLink],
  templateUrl: './notification-bell.html',
  styleUrls: ['./notification-bell.scss'],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'overlays.hasOpen() || close()',
  },
})
export class NotificationBell {
  protected readonly overlays = inject(OverlayStack);
  protected readonly center = inject(NotificationCenterService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);

  protected readonly isOpen = signal(false);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly loadFailed = signal(false);
  private request: Subscription | null = null;

  constructor() {
    this.center.live$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((n) => {
      if (this.isOpen()) {
        // Coalesced notifications come back with the same id — move them to the top.
        this.items.update((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, PANEL_SIZE));
      }
    });
  }

  protected toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.isOpen.set(true);
      this.load();
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.request?.unsubscribe();
  }

  protected onDocumentClick(event: Event): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.isLoading.set(true);
    this.loadFailed.set(false);
    this.request = this.center.list(1, PANEL_SIZE).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  protected open(n: AppNotification): void {
    if (!n.isRead) {
      this.center.markRead(n).subscribe({ error: () => void 0 });
      this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    const link = notificationLink(n);
    if (link) {
      this.close();
      void this.router.navigate(link);
    }
  }

  protected markAllRead(): void {
    this.center.markAllRead().subscribe({
      next: () => this.items.update((list) => list.map((x) => ({ ...x, isRead: true }))),
      error: () => void 0,
    });
  }
}
