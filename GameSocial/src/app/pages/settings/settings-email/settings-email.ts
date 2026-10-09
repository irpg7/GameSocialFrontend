import { Component, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { MeModel } from '../../../models/me.model';
import { AccountService } from '../../../services/account/account.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';

/**
 * Email change: the new address gets a confirmation link and only replaces the current one once that
 * link is opened (the old address is notified). A pending change can be cancelled.
 */
@Component({
  selector: 'app-settings-email',
  imports: [FormField, FormRoot],
  templateUrl: './settings-email.html',
  styleUrl: '../_settings-section.scss',
})
export class SettingsEmail {
  private account = inject(AccountService);
  private notifications = inject(NotificationService);

  readonly me = input.required<MeModel>();

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;
  protected readonly cancelling = signal(false);

  private readonly model = signal({ newEmail: '', currentPassword: '' });

  protected readonly emailForm = form(
    this.model,
    (path) => {
      required(path.newEmail, { message: 'Enter a valid email address.' });
      email(path.newEmail, { message: 'Enter a valid email address.' });
      required(path.currentPassword, { message: 'Enter your current password.' });
    },
    {
      submission: {
        action: async () => {
          const { newEmail, currentPassword } = this.model();
          try {
            await firstValueFrom(this.account.changeEmail(newEmail.trim(), currentPassword));
          } catch (err) {
            return serverError(err, 'Could not change your email.');
          }
          this.model.set({ newEmail: '', currentPassword: '' });
          this.emailForm().reset();
          this.notifications.success('Check the new inbox for a confirmation link.');
          return undefined;
        },
      },
    },
  );

  protected cancelPending(): void {
    this.cancelling.set(true);
    this.account.cancelEmailChange().subscribe({
      next: () => this.cancelling.set(false),
      error: (err: unknown) => {
        this.cancelling.set(false);
        this.notifications.error(extractApiErrorMessage(err, 'Could not cancel the email change.'));
      },
    });
  }
}
