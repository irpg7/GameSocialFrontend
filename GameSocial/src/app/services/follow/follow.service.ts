import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FollowToggleResult, FollowedGameModel, FollowedUserModel } from '../../models/follow.model';

/**
 * NOTE: the backend only exposes "list who I already follow" for people
 * (GET users/followed) — there is no browse/discovery endpoint for new
 * people to follow; player discovery goes through the header search
 * (SearchService). Both followed lists carry a `newPostCount` that the feed
 * sidebar shows as a red dot/count and resets with mark*Seen().
 */
@Service()
export class FollowService {
  private http = inject(HttpClient);

  toggleGameFollow(gameId: number): Observable<FollowToggleResult> {
    return this.http.post<FollowToggleResult>(`/api/games/${gameId}/follow`, {});
  }

  getFollowedGames(): Observable<FollowedGameModel[]> {
    return this.http.get<FollowedGameModel[]>('/api/games/followed');
  }

  /** Clears a followed game's "new posts" dot (selected in the feed sidebar). */
  markGameSeen(gameId: number): Observable<void> {
    return this.http.post<void>(`/api/games/${gameId}/follow/seen`, {});
  }

  toggleUserFollow(userId: string): Observable<FollowToggleResult> {
    return this.http.post<FollowToggleResult>(`/api/users/${userId}/follow`, {});
  }

  getFollowedUsers(): Observable<FollowedUserModel[]> {
    return this.http.get<FollowedUserModel[]>('/api/users/followed');
  }

  /** Clears a followed person's new-post count (selected in the feed sidebar). */
  markUserSeen(userId: string): Observable<void> {
    return this.http.post<void>(`/api/users/${userId}/follow/seen`, {});
  }
}
