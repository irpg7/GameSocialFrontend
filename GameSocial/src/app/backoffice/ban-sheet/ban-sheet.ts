import { Component, inject, input, output, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { BAN_DURATIONS, BanDuration, ReportTargetType } from '../../models/moderation.model';
import { ModerationService } from '../../services/moderation/moderation.service';
import { SheetModal } from '../../shared/sheet-modal/sheet-modal';
import { SelectControl } from '../../shared/select-control';
import { fieldError, serverError, submitError } from '../../shared/form-errors';

/**
 * Site-wide ban (duration + reason) — shared by Backoffice → Moderation and → Users. The server ends the
 * user's sessions and closes their realtime connections right away. `from` also resolves that queue item.
 */
@Component({
  selector: 'app-ban-sheet',
  imports: [FormField, FormRoot, SheetModal, SelectControl],
  template: `
    <app-sheet-modal title="Ban user" [subtitle]="'@' + username() + ' — signs them out everywhere'" (closed)="closed.emit()">
      <form class="ban-stack" [formRoot]="banForm">
        <div class="form-group">
          <label for="ban-duration">Duration</label>
          <select id="ban-duration" [formField]="banForm.duration">
            <button><selectedcontent></selectedcontent></button>
            @for (option of durations; track option.key) {
              <option [value]="option.key">{{ option.label }}</option>
            }
          </select>
        </div>
        <div class="form-group">
          <label for="ban-reason">Reason (shown to the user when they try to sign in)</label>
          <textarea id="ban-reason" rows="3" [formField]="banForm.reason"></textarea>
          @if (fieldError(banForm.reason()); as message) {
            <span class="ban-error">{{ message }}</span>
          }
        </div>
        @if (submitError(banForm()); as message) {
          <p class="ban-error" role="alert">{{ message }}</p>
        }
        <div class="ban-actions">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn-primary" [disabled]="banForm().submitting()">
            {{ banForm().submitting() ? 'Banning…' : 'Ban user' }}
          </button>
        </div>
      </form>
    </app-sheet-modal>
  `,
  styles: `
    .ban-stack { display: flex; flex-direction: column; gap: 14px; }
    .ban-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .ban-error { display: block; margin: 4px 0 0; font-size: 13px; color: #e11d2e; }
  `,
})
export class BanSheet {
  private moderation = inject(ModerationService);

  readonly userId = input.required<string>();
  readonly username = input.required<string>();
  readonly from = input<{ type: ReportTargetType; id: string } | undefined>(undefined);
  readonly banned = output<void>();
  readonly closed = output<void>();

  protected readonly durations = BAN_DURATIONS;
  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ duration: 'SevenDays' as BanDuration, reason: '' });

  protected readonly banForm = form(
    this.model,
    (path) => {
      required(path.reason, { message: 'Enter a reason.' });
      maxLength(path.reason, 500, { message: 'Keep the reason under 500 characters.' });
    },
    {
      submission: {
        action: async () => {
          const { duration, reason } = this.model();
          try {
            await firstValueFrom(this.moderation.ban(this.userId(), duration, reason.trim(), this.from()));
          } catch (err) {
            return serverError(err, 'Could not ban this user.');
          }
          this.banned.emit();
          return undefined;
        },
      },
    },
  );
}
