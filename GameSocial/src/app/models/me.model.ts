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
  /** Account settings: the sign-in address, and a new one waiting for its confirmation link. */
  email: string;
  pendingEmail?: string | null;
  bio?: string | null;
  /** When the username may change again (null/absent = now). */
  usernameChangeAvailableAt?: string | null;
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
  /** Settings → Privacy. */
  allowMessagesFrom: MessagePermissionName;
  showOnlineStatus: boolean;
  profileActivityVisibility: ActivityVisibilityName;
  /** People I blocked — the squad chat folds their messages. */
  blockedUserIds: string[];
  /** First sign-in: show /onboarding (genres → games → squads) until it is finished or skipped. */
  needsOnboarding: boolean;
}

/** Domain.Enums.MessagePermission — who can send me direct messages. */
export type MessagePermissionName = 'Everyone' | 'Following' | 'Nobody';

/** Domain.Enums.ActivityVisibility — who sees the post/clip/review lists on my profile. */
export type ActivityVisibilityName = 'Public' | 'Followers';

/** Domain.Enums.PresenceStatus. */
export type PresenceStatusName = 'Online' | 'Invisible' | 'DoNotDisturb';
