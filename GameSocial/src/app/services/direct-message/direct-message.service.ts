import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import { Conversation, DirectMessage, DirectMessagePage } from '../../models/direct-message.model';

/** 1:1 direct messages (`/api/messages/...`). Live updates come from `UserRealtimeService`. */
@Service()
export class DirectMessageService {
  private http = inject(HttpClient);

  conversations(page = 1, pageSize = 30): Observable<PagedResult<Conversation>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<Conversation>>('/api/messages/conversations', { params });
  }

  /** Existing conversation with this user, or a new one (403 when they don't accept messages from me). */
  open(userId: string): Observable<Conversation> {
    return this.http.post<Conversation>('/api/messages/conversations', { userId });
  }

  conversation(conversationId: string): Observable<Conversation> {
    return this.http.get<Conversation>(`/api/messages/conversations/${conversationId}`);
  }

  /** Newest `limit` messages, or the ones before `before` (oldest first). */
  messages(conversationId: string, before?: string, limit = 40): Observable<DirectMessagePage> {
    let params = new HttpParams().set('limit', limit);
    if (before) {
      params = params.set('before', before);
    }
    return this.http.get<DirectMessagePage>(`/api/messages/conversations/${conversationId}/messages`, { params });
  }

  send(conversationId: string, body: string): Observable<DirectMessage> {
    return this.http.post<DirectMessage>(`/api/messages/conversations/${conversationId}/messages`, { body });
  }

  markRead(conversationId: string): Observable<void> {
    return this.http.post<void>(`/api/messages/conversations/${conversationId}/read`, {});
  }

  /** "Delete for me": hides the history on my side only. */
  clear(conversationId: string): Observable<void> {
    return this.http.delete<void>(`/api/messages/conversations/${conversationId}`);
  }
}
