import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  SquadGuideModel,
  SquadGuideRequest,
  SquadLatestActivityModel,
  SquadLibraryModel,
  SquadLeaderboardEntryModel,
  SquadMessageModel,
} from '../../models/squad.model';

/**
 * Squad room–only endpoints (reactions, pinned guides, read state, weekly
 * board). Kept apart from SquadService, which owns squad/membership CRUD.
 */
@Service()
export class SquadRoomService {
  private http = inject(HttpClient);
  private apiUrl = '/api/squads';

  /** Toggles one emoji for the current user; returns the message with fresh reaction counts. */
  toggleReaction(squadId: string, channelId: string, messageId: string, emoji: string): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(
      `${this.apiUrl}/${squadId}/channels/${channelId}/messages/${messageId}/reactions`,
      { emoji },
    );
  }

  /** Clears the channel's unread badge for the current user. */
  markChannelRead(squadId: string, channelId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${squadId}/channels/${channelId}/read`, {});
  }

  /** Featured (PINNED) guide first, then most recently updated. */
  listGuides(squadId: string): Observable<SquadGuideModel[]> {
    return this.http.get<SquadGuideModel[]>(`${this.apiUrl}/${squadId}/guides`);
  }

  createGuide(squadId: string, request: SquadGuideRequest): Observable<SquadGuideModel> {
    return this.http.post<SquadGuideModel>(`${this.apiUrl}/${squadId}/guides`, request);
  }

  updateGuide(squadId: string, guideId: string, request: SquadGuideRequest): Observable<SquadGuideModel> {
    return this.http.put<SquadGuideModel>(`${this.apiUrl}/${squadId}/guides/${guideId}`, request);
  }

  deleteGuide(squadId: string, guideId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${squadId}/guides/${guideId}`);
  }

  /** Founder/admin: moves the guide into the PINNED card. */
  featureGuide(squadId: string, guideId: string): Observable<SquadGuideModel> {
    return this.http.post<SquadGuideModel>(`${this.apiUrl}/${squadId}/guides/${guideId}/feature`, {});
  }

  /** Tab counts: clips, screens (photos) and guides, plus photos per game. */
  getLibrary(squadId: string): Observable<SquadLibraryModel> {
    return this.http.get<SquadLibraryModel>(`${this.apiUrl}/${squadId}/library`);
  }

  /** Latest chat event per squad I'm in — the sidebar cards' activity line. */
  getMySquadActivity(): Observable<SquadLatestActivityModel[]> {
    return this.http.get<SquadLatestActivityModel[]>(`${this.apiUrl}/mine/activity`);
  }

  /** "This week's board" — XP earned in the last 7 days (ledger), ranked. */
  getWeeklyBoard(squadId: string): Observable<SquadLeaderboardEntryModel[]> {
    return this.http.get<SquadLeaderboardEntryModel[]>(`${this.apiUrl}/${squadId}/leaderboard`, {
      params: { window: 'week' },
    });
  }
}
