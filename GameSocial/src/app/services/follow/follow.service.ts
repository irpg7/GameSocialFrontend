import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FollowToggleResult, FollowedUserModel } from '../../models/follow.model';
import { GameModel } from '../../models/game.model';

/**
 * NOTE: the backend only exposes "list who I already follow" for people
 * (GET users/followed) — there is no browse/discovery endpoint for new
 * people to follow. Games are fully browsable (GameService.getGames()) so
 * the Games follow-tab can offer real discovery + toggle; the People tab
 * can only ever show the already-followed list. Documented here rather
 * than faked with placeholder users.
 */
@Service()
export class FollowService {
  private http = inject(HttpClient);

  toggleGameFollow(gameId: number): Observable<FollowToggleResult> {
    return this.http.post<FollowToggleResult>(`/api/games/${gameId}/follow`, {});
  }

  getFollowedGames(): Observable<GameModel[]> {
    return this.http.get<GameModel[]>('/api/games/followed');
  }

  toggleUserFollow(userId: string): Observable<FollowToggleResult> {
    return this.http.post<FollowToggleResult>(`/api/users/${userId}/follow`, {});
  }

  getFollowedUsers(): Observable<FollowedUserModel[]> {
    return this.http.get<FollowedUserModel[]>('/api/users/followed');
  }
}
