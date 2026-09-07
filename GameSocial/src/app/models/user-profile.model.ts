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
}
