import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import {
  CreateSquadRequest,
  SquadChannelModel,
  SquadLeaderboardEntryModel,
  SquadMemberModel,
  SquadMessageModel,
  SquadModel,
} from '../../models/squad.model';

@Service()
export class SquadService {
  private http = inject(HttpClient);
  private apiUrl = '/api/squads';

  create(request: CreateSquadRequest): Observable<SquadModel> {
    return this.http.post<SquadModel>(this.apiUrl, request);
  }

  /** Squads the current user is a member of. Not paginated. */
  getMine(): Observable<SquadModel[]> {
    return this.http.get<SquadModel[]>(`${this.apiUrl}/mine`);
  }

  getById(squadId: number): Observable<SquadModel> {
    return this.http.get<SquadModel>(`${this.apiUrl}/${squadId}`);
  }

  listMembers(squadId: number): Observable<SquadMemberModel[]> {
    return this.http.get<SquadMemberModel[]>(`${this.apiUrl}/${squadId}/members`);
  }

  /** Captain-only in practice — only InviteOnly squads have a working join path today (add-by-username). */
  addMember(squadId: number, username: string): Observable<SquadMemberModel> {
    return this.http.post<SquadMemberModel>(`${this.apiUrl}/${squadId}/members`, { username });
  }

  createChannel(squadId: number, name: string): Observable<SquadChannelModel> {
    return this.http.post<SquadChannelModel>(`${this.apiUrl}/${squadId}/channels`, { name });
  }

  listMessages(squadId: number, channelId: number, page = 1, pageSize = 30): Observable<PagedResult<SquadMessageModel>> {
    return this.http.get<PagedResult<SquadMessageModel>>(`${this.apiUrl}/${squadId}/channels/${channelId}/messages`, {
      params: { page, pageSize },
    });
  }

  /** Exactly one of body/sharedPostId must be provided — enforced server-side. */
  sendMessage(squadId: number, channelId: number, body?: string, sharedPostId?: number): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(`${this.apiUrl}/${squadId}/channels/${channelId}/messages`, {
      body,
      sharedPostId,
    });
  }

  toggleMessagePin(squadId: number, channelId: number, messageId: number): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(
      `${this.apiUrl}/${squadId}/channels/${channelId}/messages/${messageId}/pin`,
      {},
    );
  }

  /** Ranked by current all-time XP — there is no weekly-XP tracking, despite the mock's "weekly" framing. */
  getLeaderboard(squadId: number): Observable<SquadLeaderboardEntryModel[]> {
    return this.http.get<SquadLeaderboardEntryModel[]>(`${this.apiUrl}/${squadId}/leaderboard`);
  }
}
