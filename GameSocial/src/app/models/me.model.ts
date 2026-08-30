/**
 * Corresponds to Domain.Responses.MeResponse (GET /api/users/me).
 *
 * This is DIFFERENT from the JWT claims that back AuthService.currentUser():
 * the JWT is static from login, this reflects live gamification state (xp,
 * level, streak, ...) and must be refetched whenever such state can change.
 */
export interface MeModel {
  id: string;
  username: string;
  xp: number;
  level: number;
  xpToNextLevel: number;
  /** 0-100 */
  xpProgressPercent: number;
  currentStreakDays: number;
  isDeveloper: boolean;
  isPremium: boolean;
  permissions: string[];
}
