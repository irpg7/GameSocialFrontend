import { Component, inject, signal } from '@angular/core';
import { MeService } from '../../services/me/me.service';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { LoadError } from '../../shared/load-error/load-error';
import { SettingsEmail } from './settings-email/settings-email';
import { SettingsPassword } from './settings-password/settings-password';
import { SettingsProfile } from './settings-profile/settings-profile';
import { SettingsUsername } from './settings-username/settings-username';
import { SettingsPrivacy } from './settings-privacy/settings-privacy';
import { SettingsBlocked } from './settings-blocked/settings-blocked';
import { SettingsDanger } from './settings-danger/settings-danger';

/** `/settings` — the signed-in user's account: profile and avatar, username, email, password, privacy, blocks, data export and deletion. */
@Component({
  selector: 'app-settings',
  imports: [LoadError, SettingsProfile, SettingsUsername, SettingsEmail, SettingsPassword, SettingsPrivacy, SettingsBlocked, SettingsDanger],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private meService = inject(MeService);

  protected readonly me = this.meService.me;
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    // Fresh copy: the email/pending email may have changed in another tab (confirmation link).
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.meService.refresh().subscribe({
      error: (err: unknown) => this.loadError.set(extractApiErrorMessage(err, 'Could not load your account.')),
    });
  }
}
