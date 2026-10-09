import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { BlockedUser } from '../../../models/moderation.model';
import { BlockService } from '../../../services/safety/block.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { LoadError } from '../../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../../shared/api-error.util';

/** Blocked users — newest first, each with "Unblock" (follows don't come back). */
@Component({
  selector: 'app-settings-blocked',
  imports: [DatePipe, RouterLink, ImgFallback, LoadError],
  templateUrl: './settings-blocked.html',
  styleUrls: ['../_settings-section.scss', './settings-blocked.scss'],
})
export class SettingsBlocked {
  private blockService = inject(BlockService);
  private notifications = inject(NotificationService);

  protected readonly users = signal<BlockedUser[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.blockService.list().subscribe({
      next: (users) => this.users.set(users),
      error: (err: unknown) => this.loadError.set(extractApiErrorMessage(err, 'Could not load blocked users.')),
    });
  }

  protected unblock(user: BlockedUser): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(user.userId);
    this.blockService
      .unblock(user.userId)
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => {
          this.users.update((list) => (list ?? []).filter((u) => u.userId !== user.userId));
          this.notifications.success(`Unblocked @${user.username}.`);
        },
        error: (err: unknown) => this.notifications.error(extractApiErrorMessage(err, 'Could not unblock this user.')),
      });
  }
}
