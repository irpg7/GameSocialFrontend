import { Component, ElementRef, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { FormField, FormRoot, form, maxLength } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { MeModel } from '../../../models/me.model';
import { AccountService } from '../../../services/account/account.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

const BIO_MAX_LENGTH = 280;
const STUDIO_MAX_LENGTH = 100;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Avatar (upload / remove) and the profile text: bio, plus the studio name for developer accounts. */
@Component({
  selector: 'app-settings-profile',
  imports: [FormField, FormRoot, ImgFallback],
  templateUrl: './settings-profile.html',
  styleUrls: ['../_settings-section.scss', './settings-profile.scss'],
})
export class SettingsProfile {
  private account = inject(AccountService);
  private notifications = inject(NotificationService);

  readonly me = input.required<MeModel>();

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;
  protected readonly bioMax = BIO_MAX_LENGTH;
  protected readonly avatarBusy = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  /** Re-seeded whenever `me` changes (a save returns the fresh profile). */
  private readonly model = linkedSignal(() => ({
    bio: this.me().bio ?? '',
    studioName: this.me().studioName ?? '',
  }));

  protected readonly bioLength = computed(() => this.model().bio.length);

  protected readonly profileForm = form(
    this.model,
    (path) => {
      maxLength(path.bio, BIO_MAX_LENGTH, { message: `Bio can be at most ${BIO_MAX_LENGTH} characters.` });
      maxLength(path.studioName, STUDIO_MAX_LENGTH, { message: `Studio name can be at most ${STUDIO_MAX_LENGTH} characters.` });
    },
    {
      submission: {
        action: async () => {
          const { bio, studioName } = this.model();
          try {
            await firstValueFrom(this.account.updateProfile(bio, this.me().isDeveloper ? studioName : null));
          } catch (err) {
            return serverError(err, 'Could not save your profile.');
          }
          this.notifications.success('Profile saved.');
          return undefined;
        },
      },
    },
  );

  protected chooseAvatar(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onAvatarSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) {
      return;
    }
    if (!AVATAR_TYPES.includes(file.type) || file.size > AVATAR_MAX_BYTES) {
      this.avatarError.set('Choose a JPG, PNG or WebP image up to 5 MB.');
      return;
    }
    this.avatarError.set(null);
    this.avatarBusy.set(true);
    this.account.uploadAvatar(file).subscribe({
      next: () => {
        this.avatarBusy.set(false);
        this.notifications.success('Avatar updated.');
      },
      error: (err: unknown) => {
        this.avatarBusy.set(false);
        this.avatarError.set(extractApiErrorMessage(err, 'Could not upload the avatar.'));
      },
    });
  }

  protected removeAvatar(): void {
    this.avatarError.set(null);
    this.avatarBusy.set(true);
    this.account.removeAvatar().subscribe({
      next: () => this.avatarBusy.set(false),
      error: (err: unknown) => {
        this.avatarBusy.set(false);
        this.avatarError.set(extractApiErrorMessage(err, 'Could not remove the avatar.'));
      },
    });
  }
}
