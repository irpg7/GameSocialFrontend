import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import { BanDuration, ModerationQueueItem, ModerationQueueQuery, ReportTargetType } from '../../models/moderation.model';
import { toHttpParams } from '../../shared/http-params';

/**
 * Backoffice → Moderation (`/api/moderation/...`, Moderation.Manage; ban/unban also Users.Manage).
 * Every action writes an audit row the queue shows as the item's history.
 */
@Service()
export class ModerationService {
  private http = inject(HttpClient);
  private apiUrl = '/api/moderation';

  queue(query: ModerationQueueQuery): Observable<PagedResult<ModerationQueueItem>> {
    return this.http.get<PagedResult<ModerationQueueItem>>(`${this.apiUrl}/queue`, { params: toHttpParams(query) });
  }

  dismiss(type: ReportTargetType, id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/targets/${type}/${id}/dismiss`, { reason: reason.trim() || null });
  }

  /** Hides the content for everyone (moderators still see it here); reversible with `restore`. */
  remove(type: ReportTargetType, id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/targets/${type}/${id}/remove`, { reason });
  }

  restore(type: ReportTargetType, id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/targets/${type}/${id}/restore`, { reason: reason.trim() || null });
  }

  /**
   * Site-wide ban: ends every session of the user now. `from` closes that queue item's reports too.
   */
  ban(userId: string, duration: BanDuration, reason: string, from?: { type: ReportTargetType; id: string }): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${userId}/ban`, {
      duration,
      reason,
      targetType: from?.type ?? null,
      targetId: from?.id ?? null,
    });
  }

  unban(userId: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${userId}/unban`, { reason: reason.trim() || null });
  }
}
