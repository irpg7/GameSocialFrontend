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
}
