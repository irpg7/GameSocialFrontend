import { Component, OnInit, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { finalize } from 'rxjs';
import { SettingService } from '../../services/setting/setting.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SettingModel } from '../../models/setting.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';

interface SettingRow extends SettingModel {
  savedValue: string;
  isSaving: boolean;
}

@Component({
  selector: 'app-settings-admin',
  imports: [FormField],
  templateUrl: './settings-admin.html',
  styleUrl: './settings-admin.scss',
})
export class SettingsAdmin implements OnInit {
  private settingService = inject(SettingService);
  private notificationService = inject(NotificationService);

  /** The table is the form: each row's `value` is bound to its input, saved per row. */
  protected readonly rows = signal<SettingRow[]>([]);
  protected readonly rowsForm = form(this.rows);
  protected readonly isLoading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  save(key: string): void {
    const row = this.rows().find((candidate) => candidate.key === key);
    if (!row) {
      return;
    }
    const value = row.value;
    this.patchRow(key, { isSaving: true });
    this.settingService
      .update(key, value)
      .pipe(finalize(() => this.patchRow(key, { isSaving: false })))
      .subscribe({
        next: () => this.patchRow(key, { savedValue: value }),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to save setting.')),
      });
  }

  private patchRow(key: string, patch: Partial<SettingRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  private load(): void {
    this.isLoading.set(true);
    this.settingService
      .list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (settings) =>
          this.rows.set(
            settings.map((setting) => ({
              ...setting,
              description: setting.description ?? '',
              savedValue: setting.value,
              isSaving: false,
            })),
          ),
        error: () => this.notificationService.error('Failed to load settings.'),
      });
  }
}
