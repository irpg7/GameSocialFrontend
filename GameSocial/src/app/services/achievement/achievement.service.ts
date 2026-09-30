import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AchievementModel, AchievementSummaryModel } from '../../models/achievement.model';
import { SquadLeaderboardEntryModel } from '../../models/squad.model';

@Service()
export class AchievementService {
  private http = inject(HttpClient);
  private apiUrl = '/api/achievements';

  /** All achievements merged with the current user's progress/earned/showcase state. Not paginated. */
  getAll(): Observable<AchievementModel[]> {
    return this.http.get<AchievementModel[]>(this.apiUrl);
  }

  /** Earned / in-progress counts and the "top N% overall" percentile for the current user. */
  getSummary(): Observable<AchievementSummaryModel> {
    return this.http.get<AchievementSummaryModel>(`${this.apiUrl}/summary`);
  }

  /** Any user's showcase (pinned trophies), in slot order. */
  getUserShowcase(userId: string): Observable<AchievementModel[]> {
    return this.http.get<AchievementModel[]>(`/api/users/${userId}/achievements/showcase`);
  }

  /** Trophies' "Squad comparison": squad members ranked by trophies earned. */
  getSquadComparison(squadId: string): Observable<SquadLeaderboardEntryModel[]> {
    const params = new HttpParams().set('sort', 'trophies');
    return this.http.get<SquadLeaderboardEntryModel[]>(`/api/squads/${squadId}/leaderboard`, { params });
  }

  /**
   * Pins the achievement to showcase slot 1-3, or unpins when slot is null.
   * Pinning an achievement the user hasn't earned yet is rejected server-side.
   */
  setShowcaseSlot(achievementId: string, showcaseSlot: number | null): Observable<AchievementModel> {
    return this.http.post<AchievementModel>(`${this.apiUrl}/${achievementId}/showcase`, { showcaseSlot });
  }
}
