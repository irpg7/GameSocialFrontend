import { GameModel } from './game.model';

/**
 * Corresponds to Domain.Responses.FollowResponse — returned by both the
 * game-follow and user-follow toggle endpoints.
 */
export interface FollowToggleResult {
  following: boolean;
}

/**
 * Corresponds to Domain.Responses.FollowedUserResponse (GET /api/users/followed).
 *
 * NOTE (deliberate asymmetry, see FollowService): there is no backend endpoint
 * to discover/browse people who are NOT already followed — only this
 * already-followed list exists. This shape is also intentionally minimal:
 * no level/xp/avatar field is available here (unlike GameModel for games).
 */
export interface FollowedUserModel {
  userId: string;
  username: string;
  isDeveloper: boolean;
  avatarUrl?: string;
  xp?: number;
  level?: number;
  /** Feed sidebar's red count: posts since the row was last selected (POST users/{id}/follow/seen). */
  newPostCount?: number;
}

/** Domain.Responses.FollowedGameResponse (GET /api/games/followed) — a GameModel plus the sidebar's red "new posts" dot. */
export interface FollowedGameModel extends GameModel {
  newPostCount: number;
}

/** Query for GET /api/games/followed and /api/users/followed (paged, max 100 per page). */
export interface FollowedListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}
