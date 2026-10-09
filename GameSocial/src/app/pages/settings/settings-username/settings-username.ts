import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormField, FormRoot, form, required, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { MeModel } from '../../../models/me.model';
import { AccountService } from '../../../services/account/account.service';
import { MeService } from '../../../services/me/me.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';
import { USERNAME_PATTERN } from '../../../shared/password-rules';

const USERNAME_MESSAGE = 'Username must be 3-24 characters: letters, digits, dots, underscores and hyphens only.';

/** Username change — limited to once per cooldown period by the server (`usernameChangeAvailableAt`). */
@Component({
  selector: 'app-settings-username',
  imports: [FormField, FormRoot, DatePipe],
  templateUrl: './settings-username.html',
  styleUrl: '../_settings-section.scss',
})
export class SettingsUsername {
  private account = inject(AccountService);
  private meService = inject(MeService);
  private notifications = inject(NotificationService);

  readonly me = input.required<MeModel>();

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  protected readonly lockedUntil = computed(() => this.me().usernameChangeAvailableAt ?? null);

  private readonly model = linkedSignal(() => ({ username: this.me().username }));

  protected readonly unchanged = computed(() => this.model().username.trim() === this.me().username);

  protected readonly usernameForm = form(
    this.model,
    (path) => {
      required(path.username, { message: USERNAME_MESSAGE });
      validate(path.username, ({ value }) =>
        USERNAME_PATTERN.test(value().trim()) ? undefined : { kind: 'pattern', message: USERNAME_MESSAGE },
      );
    },
    {
      submission: {
        action: async () => {
          try {
            await firstValueFrom(this.account.changeUsername(this.model().username.trim()));
            // The cooldown date and the new name come from the server.
            await firstValueFrom(this.meService.refresh());
          } catch (err) {
            return serverError(err, 'Could not change your username.');
          }
          this.notifications.success('Username changed.');
          return undefined;
        },
      },
    },
  );
}
