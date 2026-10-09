import { AchievementModel } from './achievement.model';

/**
 * Corresponds to Domain.Responses.UserProfileResponse (GET /api/users/{userId}/profile).
 */
export interface UserProfileModel {
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
  avatarUrl?: string | null;
  bio?: string | null;
  /** Developer accounts: "Posting as the Ashfall team". */
  studioName?: string | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  isFollowedByCurrentUser: boolean;
  isCurrentUser: boolean;
  /** Trophies earned — "19 trophies · top 8% overall". */
  earnedAchievementsCount: number;
  trophyTopPercent: number;
  /** Achievements pinned to the profile showcase, in slot order (max 3). */
  showcase: AchievementModel[];
  /** A block between us (either way): only `id` (and `username` if I blocked them) are filled. */
  isUnavailable?: boolean;
  /** I blocked this user — the page offers "Unblock". */
  isBlockedByCurrentUser?: boolean;
  /** The owner limits activity to followers and I don't follow them: post lists come back empty. */
  activityHidden?: boolean;
  /** I may start a DM with this user (no block, and their "who can message you" setting allows me). */
  canMessage?: boolean;
  /** Site-wide ban — filled for moderators only. */
  isBanned?: boolean;
  bannedAt?: string | null;
  banEndsAt?: string | null;
  banReason?: string | null;
}
