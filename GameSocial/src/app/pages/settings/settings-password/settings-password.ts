import { Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, required, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AccountService } from '../../../services/account/account.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';
import { passwordRules } from '../../../shared/password-rules';

/** Password change — signs out every other session; this one continues with a fresh token pair. */
@Component({
  selector: 'app-settings-password',
  imports: [FormField, FormRoot],
  templateUrl: './settings-password.html',
  styleUrl: '../_settings-section.scss',
})
export class SettingsPassword {
  private account = inject(AccountService);
  private notifications = inject(NotificationService);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ currentPassword: '', newPassword: '', confirm: '' });

  protected readonly passwordForm = form(
    this.model,
    (path) => {
      required(path.currentPassword, { message: 'Enter your current password.' });
      passwordRules(path.newPassword);
      required(path.confirm, { message: 'Repeat the new password.' });
      validate(path.confirm, ({ value, valueOf }) =>
        value() && value() !== valueOf(path.newPassword)
          ? { kind: 'mismatch', message: 'The passwords do not match.' }
          : undefined,
      );
    },
    {
      submission: {
        action: async () => {
          const { currentPassword, newPassword } = this.model();
          try {
            await firstValueFrom(this.account.changePassword(currentPassword, newPassword));
          } catch (err) {
            return serverError(err, 'Could not change your password.');
          }
          this.model.set({ currentPassword: '', newPassword: '', confirm: '' });
          this.passwordForm().reset();
          this.notifications.success('Password changed. Other devices were signed out.');
          return undefined;
        },
      },
    },
  );
}
