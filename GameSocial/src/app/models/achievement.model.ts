/**
 * Corresponds to Domain.Enums.AchievementRuleType as serialized by the backend.
 */
export type AchievementRuleTypeName =
  | 'PostCountByType'
  | 'UsefulVotesReceived'
  | 'StreakDays'
  /** Highest level among the squads the user captains. */
  | 'SquadCaptainOf'
  | 'SquadMemberCountAtPostTime'
  /** Binary — one of the user's clips was the most-liked clip of its day. */
  | 'ClipTopOfDay'
  /** In-game stat reported by the game's studio (POST achievements/{id}/progress). */
  | 'GameStat';

/**
 * Corresponds to Domain.Responses.AchievementResponse (GET /api/achievements).
 * A single flat list mixing every achievement's static definition with the
 * current user's progress/earned/showcase state — there is no separate
 * "definition" vs "progress" shape.
 */
export interface AchievementModel {
  id: string;
  key: string;
  name: string;
  /** May contain a `{progress}` placeholder, filled with progressCurrent when shown. */
  description: string;
  /** Short geometric glyph, e.g. "◎ ◈ ◍ ★". */
  icon: string;
  gameId?: number;
  gameName?: string;
  ruleType: AchievementRuleTypeName;
  ruleThreshold: number;
  rulePostType?: string;
  progressCurrent: number;
  /** null/undefined while not yet earned. */
  earnedAt?: string;
  /** 1-3 if pinned to the profile showcase, otherwise null/undefined. */
  showcaseSlot?: number;
  /** Live-computed: (users who earned it / total users) * 100, rounded to 1 decimal. */
  rarityPercent: number;
}

/** Corresponds to Domain.Responses.AchievementSummaryResponse (GET /api/achievements/summary). */
export interface AchievementSummaryModel {
  earnedCount: number;
  inProgressCount: number;
  totalCount: number;
  /** "top N% overall", 1-100. */
  topPercent: number;
}
