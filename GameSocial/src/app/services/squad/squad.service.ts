import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import {
  CreateSquadRequest,
  PinnedSquadMessageModel,
  SquadChannelModel,
  SquadLeaderboardEntryModel,
  SquadMemberModel,
  SquadMessageModel,
  SquadModel,
  SquadRoleName,
  UpdateSquadRequest,
} from '../../models/squad.model';

@Service()
export class SquadService {
  private http = inject(HttpClient);
  private apiUrl = '/api/squads';

  create(request: CreateSquadRequest): Observable<SquadModel> {
    return this.http.post<SquadModel>(this.apiUrl, request);
  }

  /**
   * Captain-only. PUT semantics — the body is the complete representation, so
   * the settings form must send every field, not just the changed ones.
   * The squad's `slug` is deliberately NOT regenerated on rename.
   */
  update(squadId: string, request: UpdateSquadRequest): Observable<SquadModel> {
    return this.http.put<SquadModel>(`${this.apiUrl}/${squadId}`, request);
  }

  /** Squads the current user is a member of. Not paginated; ordered by name. */
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

  /**
   * Captain-only. Rejected when it would leave the squad without a captain —
   * promote a successor first.
   */
  changeMemberRole(squadId: string, userId: string, role: SquadRoleName): Observable<SquadMemberModel> {
    return this.http.put<SquadMemberModel>(`${this.apiUrl}/${squadId}/members/${userId}`, { role });
  }

  /** Captain-only, and cannot target yourself — use `leave()` for that. */
  removeMember(squadId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${squadId}/members/${userId}`);
  }

  /**
   * Leaves the squad. Rejected for the last captain while other members remain.
   * The empty `{}` body is required: every field binds from the route, but
   * FastEndpoints still expects a JSON body on POST (same as `toggleMessagePin`).
   */
  leave(squadId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${squadId}/leave`, {});
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

  /**
   * Pinning is open to any member; UNpinning is restricted server-side to a
   * captain or the message's author.
   */
  toggleMessagePin(squadId: string, channelId: string, messageId: string): Observable<SquadMessageModel> {
    return this.http.post<SquadMessageModel>(
      `${this.apiUrl}/${squadId}/channels/${channelId}/messages/${messageId}/pin`,
      {},
    );
  }

  /**
   * Pinned messages across every channel of the squad, newest first. Replaces
   * the old per-channel scan. Members only.
   */
  listPins(squadId: string, page = 1, pageSize = 30): Observable<PagedResult<PinnedSquadMessageModel>> {
    return this.http.get<PagedResult<PinnedSquadMessageModel>>(`${this.apiUrl}/${squadId}/pins`, {
      params: { page, pageSize },
    });
  }

  /** Ranked by current all-time XP — there is no weekly-XP tracking, despite the mock's "weekly" framing. */
  getLeaderboard(squadId: string): Observable<SquadLeaderboardEntryModel[]> {
    return this.http.get<SquadLeaderboardEntryModel[]>(`${this.apiUrl}/${squadId}/leaderboard`);
  }
}
