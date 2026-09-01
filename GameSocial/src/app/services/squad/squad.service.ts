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

  getById(squadId: string): Observable<SquadModel> {
    return this.http.get<SquadModel>(`${this.apiUrl}/${squadId}`);
  }

  listMembers(squadId: string): Observable<SquadMemberModel[]> {
    return this.http.get<SquadMemberModel[]>(`${this.apiUrl}/${squadId}/members`);
  }

  /** Captain-only in practice — only InviteOnly squads have a working join path today (add-by-username). */
  addMember(squadId: string, username: string): Observable<SquadMemberModel> {
    return this.http.post<SquadMemberModel>(`${this.apiUrl}/${squadId}/members`, { username });
  }

  createChannel(squadId: string, name: string): Observable<SquadChannelModel> {
    return this.http.post<SquadChannelModel>(`${this.apiUrl}/${squadId}/channels`, { name });
  }

  listMessages(squadId: string, channelId: string, page = 1, pageSize = 30): Observable<PagedResult<SquadMessageModel>> {
    return this.http.get<PagedResult<SquadMessageModel>>(`${this.apiUrl}/${squadId}/channels/${channelId}/messages`, {
      params: { page, pageSize },
    });
  }

  /** Exactly one of body/sharedPostId must be provided — enforced server-side. */
  sendMessage(squadId: string, channelId: string, body?: string, sharedPostId?: string): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(`${this.apiUrl}/${squadId}/channels/${channelId}/messages`, {
      body,
      sharedPostId,
    });
  }

  toggleMessagePin(squadId: string, channelId: string, messageId: string): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(
      `${this.apiUrl}/${squadId}/channels/${channelId}/messages/${messageId}/pin`,
      {},
    );
  }

  /** Ranked by current all-time XP — there is no weekly-XP tracking, despite the mock's "weekly" framing. */
  getLeaderboard(squadId: string): Observable<SquadLeaderboardEntryModel[]> {
    return this.http.get<SquadLeaderboardEntryModel[]>(`${this.apiUrl}/${squadId}/leaderboard`);
  }
}
