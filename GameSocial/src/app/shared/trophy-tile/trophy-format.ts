import { AchievementModel } from '../../models/achievement.model';

/** Fills the optional `{progress}` placeholder with the user's current progress. */
export function achievementDescription(achievement: AchievementModel): string {
  return achievement.description.replace('{progress}', String(achievement.progressCurrent));
}

/** True when the description already states progress, so no "— N to go" suffix is needed. */
export function describesOwnProgress(achievement: AchievementModel): boolean {
  return achievement.description.includes('{progress}');
}

/** "0.4% HAVE THIS" / "6% HAVE THIS" — whole numbers drop the decimal, as in the design. */
export function rarityLabel(achievement: AchievementModel): string {
  return `${Number(achievement.rarityPercent.toFixed(1))}% HAVE THIS`;
}

/**
 * The design's earned-at meta: "2 gün önce", "5 gün önce", "1 hafta", "2 hafta".
 * `now` is passed in (templates must not reach for globals).
 */
export function earnedAgo(earnedAt: string, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(earnedAt).getTime()) / 86_400_000));
  if (days === 0) {
    return 'bugün';
  }
  if (days < 7) {
    return `${days} gün önce`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)} hafta`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)} ay`;
  }
  return `${Math.floor(days / 365)} yıl`;
}

/** Id of the rarest achievement in a list — the one showcase tile the design lights red. */
export function rarestId(achievements: AchievementModel[]): string | null {
  let rarest: AchievementModel | null = null;
  for (const achievement of achievements) {
    if (!rarest || achievement.rarityPercent < rarest.rarityPercent) {
      rarest = achievement;
    }
  }
  return rarest?.id ?? null;
}
