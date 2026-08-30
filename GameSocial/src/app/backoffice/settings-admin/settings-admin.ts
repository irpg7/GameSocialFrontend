import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [FormsModule],
  templateUrl: './settings-admin.html',
  styleUrl: './settings-admin.scss',
})
export class SettingsAdmin implements OnInit {
  private settingService = inject(SettingService);
  private notificationService = inject(NotificationService);

  protected readonly rows = signal<SettingRow[]>([]);
  protected readonly isLoading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  updateValue(row: SettingRow, value: string): void {
    row.value = value;
    this.rows.update((existing) => [...existing]);
  }

  save(row: SettingRow): void {
    row.isSaving = true;
    this.rows.update((existing) => [...existing]);
    this.settingService
      .update(row.key, row.value)
      .pipe(
        finalize(() => {
          row.isSaving = false;
          this.rows.update((existing) => [...existing]);
        }),
      )
      .subscribe({
        next: () => {
          row.savedValue = row.value;
          this.rows.update((existing) => [...existing]);
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to save setting.')),
      });
  }

  private load(): void {
    this.isLoading.set(true);
    this.settingService
      .list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (settings) => this.rows.set(settings.map((setting) => ({ ...setting, savedValue: setting.value, isSaving: false }))),
        error: () => this.notificationService.error('Failed to load settings.'),
      });
  }
}
