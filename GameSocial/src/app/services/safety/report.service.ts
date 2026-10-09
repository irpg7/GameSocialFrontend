import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReportReason, ReportTarget } from '../../models/moderation.model';

/**
 * Reporting (`POST /api/reports`). Any ··· menu calls `open(target)`; the one `app-report-sheet` hosted by the
 * main layout reacts to `target()` — so the sheet markup lives in a single component instead of being pasted
 * under every card. Reporting the same thing again updates your open report.
 */
@Service()
export class ReportService {
  private http = inject(HttpClient);

  private readonly targetState = signal<ReportTarget | null>(null);
  /** The thing the report sheet is open for; null = closed. */
  readonly target = this.targetState.asReadonly();

  open(target: ReportTarget): void {
    this.targetState.set(target);
  }

  close(): void {
    this.targetState.set(null);
  }

  submit(target: ReportTarget, reason: ReportReason, note: string): Observable<void> {
    return this.http.post<void>('/api/reports', {
      targetType: target.type,
      targetId: target.id,
      reason,
      note: note.trim() || null,
    });
  }
}
