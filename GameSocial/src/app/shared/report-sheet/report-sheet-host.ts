import { Component, inject } from '@angular/core';
import { ReportService } from '../../services/safety/report.service';
import { ReportSheet } from './report-sheet';

/**
 * Renders the report sheet for `ReportService.target()`. Lives once in the main layout; keyed by target so
 * opening it for something else starts a fresh form.
 */
@Component({
  selector: 'app-report-sheet-host',
  imports: [ReportSheet],
  template: `
    @if (reports.target(); as target) {
      @for (t of [target]; track t.type + t.id) {
        <app-report-sheet [target]="t" />
      }
    }
  `,
})
export class ReportSheetHost {
  protected readonly reports = inject(ReportService);
}
