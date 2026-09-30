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
}
