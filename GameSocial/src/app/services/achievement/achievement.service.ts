import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AchievementModel } from '../../models/achievement.model';

@Service()
export class AchievementService {
  private http = inject(HttpClient);
  private apiUrl = '/api/achievements';

  /** All achievements merged with the current user's progress/earned/showcase state. Not paginated. */
  getAll(): Observable<AchievementModel[]> {
    return this.http.get<AchievementModel[]>(this.apiUrl);
  }

  /**
   * Pins the achievement to showcase slot 1-3, or unpins when slot is null.
   * Pinning an achievement the user hasn't earned yet is rejected server-side.
   */
  setShowcaseSlot(achievementId: string, showcaseSlot: number | null): Observable<AchievementModel> {
    return this.http.post<AchievementModel>(`${this.apiUrl}/${achievementId}/showcase`, { showcaseSlot });
  }
}
