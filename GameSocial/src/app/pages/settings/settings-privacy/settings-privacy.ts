import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormField, FormRoot, form } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ActivityVisibilityName, MeModel, MessagePermissionName } from '../../../models/me.model';
import { AccountService } from '../../../services/account/account.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { SelectControl } from '../../../shared/select-control';
import { serverError, submitError } from '../../../shared/form-errors';

const MESSAGE_OPTIONS: { value: MessagePermissionName; label: string }[] = [
  { value: 'Everyone', label: 'Everyone' },
  { value: 'Following', label: 'People I follow' },
  { value: 'Nobody', label: 'Nobody' },
];

const ACTIVITY_OPTIONS: { value: ActivityVisibilityName; label: string }[] = [
  { value: 'Public', label: 'Everyone' },
  { value: 'Followers', label: 'Followers only' },
];

/** Privacy: who can message me, whether others see me online, who sees my posts on my profile. */
@Component({
  selector: 'app-settings-privacy',
  imports: [FormField, FormRoot, SelectControl],
  templateUrl: './settings-privacy.html',
  styleUrls: ['../_settings-section.scss', './settings-privacy.scss'],
})
export class SettingsPrivacy {
  private account = inject(AccountService);
  private notifications = inject(NotificationService);

  readonly me = input.required<MeModel>();

  protected readonly messageOptions = MESSAGE_OPTIONS;
  protected readonly activityOptions = ACTIVITY_OPTIONS;
  protected readonly submitError = submitError;

  private readonly model = linkedSignal(() => ({
    allowMessagesFrom: this.me().allowMessagesFrom ?? 'Everyone',
    showOnlineStatus: this.me().showOnlineStatus ?? true,
    profileActivityVisibility: this.me().profileActivityVisibility ?? 'Public',
  }));

  protected readonly unchanged = computed(() => {
    const value = this.model();
    const me = this.me();
    return (
      value.allowMessagesFrom === me.allowMessagesFrom &&
      value.showOnlineStatus === me.showOnlineStatus &&
      value.profileActivityVisibility === me.profileActivityVisibility
    );
  });

  protected readonly privacyForm = form(this.model, () => undefined, {
    submission: {
      action: async () => {
        try {
          await firstValueFrom(this.account.updatePrivacy(this.model()));
        } catch (err) {
          return serverError(err, 'Could not save your privacy settings.');
        }
        this.notifications.success('Privacy settings saved.');
        return undefined;
      },
    },
  });
}
