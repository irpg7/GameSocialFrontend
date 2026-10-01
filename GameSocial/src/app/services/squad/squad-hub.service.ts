import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateSquadSessionRequest,
  SquadDiscoverModel,
  SquadFriendOnlineModel,
  SquadGameOptionsModel,
  SquadInviteModel,
  SquadJoinRequestModel,
  SquadJoinResultModel,
  SquadSessionModel,
  SquadSessionRsvpModel,
  SquadWeeklyStatsModel,
} from '../../models/squad-hub.model';
import { SquadBanModel } from '../../models/squad-ban.model';

/**
 * Squad hub (expl.html 2a) + membership flows: discovery, join / join
 * requests, invites, squad voice sessions, weekly stats, friends online, transfer,
 * icon upload and the settings game picker. Kept apart from SquadService,
 * which owns the room's chat/channel calls.
 *
 * POSTs whose fields all bind from the route send an empty `{}` body —
 * FastEndpoints still expects JSON on POST (see SquadService.leave).
 */
@Service()
export class SquadHubService {
  private http = inject(HttpClient);
  private apiUrl = '/api/squads';

  discover(options: { q?: string; gameId?: number; page?: number; pageSize?: number } = {}): Observable<SquadDiscoverModel> {
    const params: Record<string, string | number> = {};
    if (options.q) params['q'] = options.q;
    if (options.gameId) params['gameId'] = options.gameId;
    params['page'] = options.page ?? 1;
    params['pageSize'] = options.pageSize ?? 3;
    return this.http.get<SquadDiscoverModel>(`${this.apiUrl}/discover`, { params });
  }

  /** Open: joins (or goes Pending when approval is on). AskToJoin: always a Pending request. */
  join(squadId: string): Observable<SquadJoinResultModel> {
    return this.http.post<SquadJoinResultModel>(`${this.apiUrl}/${squadId}/join`, {});
  }

  getMyStats(): Observable<SquadWeeklyStatsModel[]> {
    return this.http.get<SquadWeeklyStatsModel[]>(`${this.apiUrl}/mine/stats`);
  }

  getFriendsOnline(): Observable<SquadFriendOnlineModel[]> {
    return this.http.get<SquadFriendOnlineModel[]>(`${this.apiUrl}/friends-online`);
  }

  // ─── Invites ────────────────────────────────────────────────────────────
  /** Founder/admin only. */
  invite(squadId: string, username: string): Observable<SquadInviteModel> {
    return this.http.post<SquadInviteModel>(`${this.apiUrl}/${squadId}/invites`, { username });
  }

  getMyInvites(): Observable<SquadInviteModel[]> {
    return this.http.get<SquadInviteModel[]>(`${this.apiUrl}/invites/mine`);
  }

  acceptInvite(inviteId: string): Observable<SquadJoinResultModel> {
    return this.http.post<SquadJoinResultModel>(`${this.apiUrl}/invites/${inviteId}/accept`, {});
  }

  declineInvite(inviteId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/invites/${inviteId}/decline`, {});
  }

  // ─── Join requests (founder/admin) ──────────────────────────────────────
  listJoinRequests(squadId: string): Observable<SquadJoinRequestModel[]> {
    return this.http.get<SquadJoinRequestModel[]>(`${this.apiUrl}/${squadId}/join-requests`);
  }

  approveJoinRequest(squadId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${squadId}/join-requests/${userId}/approve`, {});
  }

  /** Blacklist: removes the member (or pending request), cancels invites, blocks re-joining. */
  banUser(squadId: string, userId: string): Observable<SquadBanModel> {
    return this.http.post<SquadBanModel>(`${this.apiUrl}/${squadId}/bans`, { userId });
  }

  unbanUser(squadId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${squadId}/bans/${userId}`);
  }

  listBans(squadId: string): Observable<SquadBanModel[]> {
    return this.http.get<SquadBanModel[]>(`${this.apiUrl}/${squadId}/bans`);
  }

  declineJoinRequest(squadId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${squadId}/join-requests/${userId}/decline`, {});
  }

  // ─── Sessions (the room sidebar's "Sesli sohbet") ───────────────────────
  /** Live or starting within a day; active members only. */
  getSquadSessions(squadId: string): Observable<SquadSessionModel[]> {
    return this.http.get<SquadSessionModel[]>(`${this.apiUrl}/${squadId}/sessions`);
  }

  createSession(squadId: string, request: CreateSquadSessionRequest): Observable<SquadSessionModel> {
    return this.http.post<SquadSessionModel>(`${this.apiUrl}/${squadId}/sessions`, request);
  }

  /** "I'm in" / "Join voice" — toggles. Voice itself is out of v1 scope. */
  toggleRsvp(sessionId: string): Observable<SquadSessionRsvpModel> {
    return this.http.post<SquadSessionRsvpModel>(`${this.apiUrl}/sessions/${sessionId}/rsvp`, {});
  }

  goLive(sessionId: string): Observable<SquadSessionModel> {
    return this.http.post<SquadSessionModel>(`${this.apiUrl}/sessions/${sessionId}/live`, {});
  }

  endSession(sessionId: string): Observable<SquadSessionModel> {
    return this.http.post<SquadSessionModel>(`${this.apiUrl}/sessions/${sessionId}/end`, {});
  }

  // ─── Ownership / identity ───────────────────────────────────────────────
  /** Founder only: target becomes Kurucu, you become Yönetici. */
  transfer(squadId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${squadId}/transfer`, { userId });
  }

  /** Founder/admin only; multipart field "icon", image ≤ 5 MB. */
  uploadIcon(squadId: string, file: File): Observable<{ iconUrl: string }> {
    const form = new FormData();
    form.append('icon', file, file.name);
    return this.http.post<{ iconUrl: string }>(`${this.apiUrl}/${squadId}/icon`, form);
  }

  /** Settings game picker: library first, then popular, then new. */
  getGameOptions(q?: string, take = 40): Observable<SquadGameOptionsModel> {
    const params: Record<string, string | number> = { take };
    if (q) params['q'] = q;
    return this.http.get<SquadGameOptionsModel>(`${this.apiUrl}/game-options`, { params });
  }
}
