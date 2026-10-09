import { Component, computed, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { REPORT_NOTE_MAX, REPORT_REASONS, ReportReason, ReportTarget } from '../../models/moderation.model';
import { ReportService } from '../../services/safety/report.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SheetModal } from '../sheet-modal/sheet-modal';
import { fieldError, serverError, submitError } from '../form-errors';

/**
 * "⚑ Report" sheet for a post, comment, user, squad message or squad. Hosted once by `ReportSheetHost`
 * (main layout) for whatever `ReportService.target()` is — callers only call `ReportService.open(...)`.
 */
@Component({
  selector: 'app-report-sheet',
  imports: [FormField, FormRoot, SheetModal],
  templateUrl: './report-sheet.html',
  styleUrl: './report-sheet.scss',
})
export class ReportSheet {
  private reports = inject(ReportService);
  private notifications = inject(NotificationService);

  readonly target = input.required<ReportTarget>();

  protected readonly reasons = REPORT_REASONS;
  protected readonly noteMax = REPORT_NOTE_MAX;
  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ reason: '' as ReportReason | '', note: '' });
  protected readonly reason = computed(() => this.model().reason);
  protected readonly noteLength = computed(() => this.model().note.length);

  protected readonly reportForm = form(
    this.model,
    (path) => {
      required(path.reason, { message: 'Choose a reason.' });
      maxLength(path.note, REPORT_NOTE_MAX, { message: `Keep the note under ${REPORT_NOTE_MAX} characters.` });
    },
    {
      submission: {
        action: async () => {
          const { reason, note } = this.model();
          try {
            await firstValueFrom(this.reports.submit(this.target(), reason as ReportReason, note));
          } catch (err) {
            return serverError(err, 'Could not send your report.');
          }
          this.notifications.success('Thanks — a moderator will review it.');
          this.reports.close();
          return undefined;
        },
      },
    },
  );

  protected close(): void {
    this.reports.close();
  }
}
