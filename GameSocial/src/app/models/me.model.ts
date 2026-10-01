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
  avatarUrl?: string;
  /** Account menu status row: Çevrimiçi / Oyunda görünme / Rahatsız etme. */
  presenceStatus: PresenceStatusName;
  studioName?: string;
  /** Sum of the XP ledger over the last 7 days. */
  xpThisWeek: number;
  /** Account menu counts: ▶ Klipslerim / ◇ Kaydedilenler / ★ İncelemelerim / ◫ Taslaklar. */
  clipCount: number;
  savedCount: number;
  reviewCount: number;
  draftCount: number;
  /** Games this user already reviewed — "Write a review" hides them (one review per game). */
  reviewedGameIds: number[];
  /** Developer account requested at sign-up, waiting for an admin. */
  developerRequested: boolean;
}

/** Domain.Enums.PresenceStatus. */
export type PresenceStatusName = 'Online' | 'Invisible' | 'DoNotDisturb';
