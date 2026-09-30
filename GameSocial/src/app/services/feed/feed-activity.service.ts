import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SquadActivityModel } from '../../models/squad-activity.model';

/** Feed right rail "Squad activity" — members of my squads (not me), newest first. */
@Service()
export class FeedActivityService {
  private http = inject(HttpClient);

  getSquadActivity(squadId?: string, limit = 6): Observable<SquadActivityModel[]> {
    let params = new HttpParams().set('limit', limit);
    if (squadId) {
      params = params.set('squadId', squadId);
    }
    return this.http.get<SquadActivityModel[]>('/api/feed/squad-activity', { params });
  }
}
