import { Component, inject, signal } from '@angular/core';
import { AccountService } from '../../../services/account/account.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { AccountDeleteSheet } from '../account-delete-sheet/account-delete-sheet';

/** Settings → "Your data & account": KVKK data export and account deletion (14-day grace). */
@Component({
  selector: 'app-settings-danger',
  imports: [AccountDeleteSheet],
  templateUrl: './settings-danger.html',
  styleUrls: ['../_settings-section.scss', './settings-danger.scss'],
})
export class SettingsDanger {
  private account = inject(AccountService);
  private notifications = inject(NotificationService);

  protected readonly isExporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  protected readonly isDeleteOpen = signal(false);

  protected download(): void {
    this.isExporting.set(true);
    this.exportError.set(null);
    this.account.downloadMyData().subscribe({
      next: () => {
        this.isExporting.set(false);
        this.notifications.success('Your data was downloaded.');
      },
      error: (err: unknown) => {
        this.isExporting.set(false);
        this.exportError.set(extractApiErrorMessage(err, 'Could not prepare your data. Please try again.'));
      },
    });
  }
}
