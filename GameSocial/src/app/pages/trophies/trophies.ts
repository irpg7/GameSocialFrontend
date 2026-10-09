import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { AchievementService } from '../../services/achievement/achievement.service';
import { MeService } from '../../services/me/me.service';
import { SquadService } from '../../services/squad/squad.service';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { XpAwardModel, XpAwardsService } from '../../services/config/xp-awards.service';
import { AchievementModel, AchievementSummaryModel } from '../../models/achievement.model';
import { SquadLeaderboardEntryModel, SquadModel } from '../../models/squad.model';
import { TrophyTile } from '../../shared/trophy-tile/trophy-tile';
import {
  achievementDescription,
  describesOwnProgress,
  earnedAgo,
  rarestId,
  rarityLabel,
} from '../../shared/trophy-tile/trophy-format';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { extractApiErrorMessage } from '../../shared/api-error.util';

/**
 * "Where XP comes from" — the design lists these four, in this order, with
 * these labels (it leaves devlogs out). Amounts come from GET config/xp-awards.
 */
const XP_SOURCE_ROWS: { key: XpAwardModel['key']; label: string }[] = [
  { key: 'clip', label: 'Clip' },
  { key: 'review', label: 'Review' },
  { key: 'screenshots', label: 'Screenshot set' },
  { key: 'interaction', label: 'Useful vote received' },
];

/** The design shows one row of four recently earned trophies. */
const RECENT_LIMIT = 4;

type SortMode = 'default' | 'rarest';

/**
 * Trophies (Gamer Feed.dc.html `onTrophies`). GET /api/achievements takes no
 * query params, so the game filter and rarest-first sort run client-side over
 * the one fetched list; counts in the subtitle/rail come from
 * GET /api/achievements/summary so they don't move with the filter.
 */
@Component({
  selector: 'app-trophies',
  imports: [ImgFallback, RouterLink, DecimalPipe, TrophyTile],
  templateUrl: './trophies.html',
  styleUrl: './trophies.scss',
})
export class Trophies implements OnInit {
  private achievementService = inject(AchievementService);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  private xpAwardsService = inject(XpAwardsService);
  protected readonly authService = inject(AuthService);
  protected readonly meService = inject(MeService);

  /** The design labels the showcase "N of 3 slots"; the backend's slots are 1-3. */
  protected readonly showcaseSlotCount = 3;
  private readonly now = Date.now();

  protected readonly achievements = signal<AchievementModel[]>([]);
  protected readonly summary = signal<AchievementSummaryModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly editMode = signal(false);
  protected readonly gameFilter = signal<number | 'all'>('all');
  protected readonly sortMode = signal<SortMode>('default');

  protected readonly mySquad = signal<SquadModel | null>(null);
  protected readonly comparison = signal<SquadLeaderboardEntryModel[]>([]);

  protected readonly xpSources = computed(() =>
    this.xpAwardsService.awards().length === 0
      ? []
      : XP_SOURCE_ROWS.map((row) => ({ label: row.label, amount: this.xpAwardsService.amount(row.key) })),
  );

  protected readonly games = computed(() => {
    const seen = new Map<number, string>();
    for (const achievement of this.achievements()) {
      if (achievement.gameId != null && achievement.gameName) {
        seen.set(achievement.gameId, achievement.gameName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  });

  private readonly filteredAchievements = computed(() => {
    const filter = this.gameFilter();
    const list = this.achievements();
    const filtered = filter === 'all' ? list : list.filter((a) => a.gameId === filter);
    if (this.sortMode() === 'rarest') {
      return [...filtered].sort((a, b) => a.rarityPercent - b.rarityPercent);
    }
    return filtered;
  });

  protected readonly earnedCount = computed(
    () => this.summary()?.earnedCount ?? this.achievements().filter((a) => a.earnedAt).length,
  );
  protected readonly inProgressCount = computed(
    () => this.summary()?.inProgressCount ?? this.achievements().filter((a) => !a.earnedAt && a.progressCurrent > 0).length,
  );

  protected readonly inProgressList = computed(() => {
    const list = this.filteredAchievements().filter((a) => !a.earnedAt && a.progressCurrent > 0);
    // "Rarest first" wins over the section's default closest-first order.
    return this.sortMode() === 'rarest'
      ? list
      : [...list].sort((a, b) => b.progressCurrent / b.ruleThreshold - a.progressCurrent / a.ruleThreshold);
  });

  protected readonly showcased = computed(() =>
    this.achievements()
      .filter((a) => a.showcaseSlot != null)
      .sort((a, b) => (a.showcaseSlot ?? 0) - (b.showcaseSlot ?? 0)),
  );
  protected readonly showcaseAccentId = computed(() => rarestId(this.showcased()));
  protected readonly emptySlots = computed(() =>
    Array.from({ length: Math.max(0, this.showcaseSlotCount - this.showcased().length) }, (_, i) => i),
  );

  private readonly allEarned = computed(() => {
    const earned = this.filteredAchievements().filter((a) => a.earnedAt);
    return this.sortMode() === 'rarest'
      ? earned
      : [...earned].sort((a, b) => new Date(b.earnedAt!).getTime() - new Date(a.earnedAt!).getTime());
  });

  /** One row of four normally; every earned trophy while editing, so any can be pinned. */
  protected readonly recentlyEarned = computed(() =>
    this.editMode() ? this.allEarned() : this.allEarned().slice(0, RECENT_LIMIT),
  );

  /** The current user's 1-based rank in the squad comparison (0 if absent). */
  private readonly myRank = computed(
    () => this.comparison().findIndex((entry) => this.isCurrentUser(entry.userId)) + 1,
  );

  ngOnInit(): void {
    this.achievementService.getAll().subscribe({
      next: (achievements) => {
        this.achievements.set(achievements);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });

    this.loadSummary();

    this.squadService
      .getMine()
      .pipe(
        switchMap((squads) => {
          const first = squads[0];
          if (!first) {
            return of(null);
          }
          this.mySquad.set(first);
          return this.achievementService.getSquadComparison(first.id);
        }),
      )
      .subscribe({
        next: (entries) => {
          if (entries) {
            this.comparison.set(entries);
          }
        },
        error: () => void 0,
      });
  }

  setGameFilter(gameId: number | 'all'): void {
    this.gameFilter.set(gameId);
  }

  toggleSort(): void {
    this.sortMode.update((mode) => (mode === 'rarest' ? 'default' : 'rarest'));
  }

  toggleEditMode(): void {
    this.editMode.update((value) => !value);
  }

  onAchievementClick(achievement: AchievementModel): void {
    if (!this.editMode() || !achievement.earnedAt) {
      return;
    }
    if (achievement.showcaseSlot != null) {
      this.setShowcaseSlot(achievement.id, null);
      return;
    }
    const usedSlots = new Set(this.showcased().map((a) => a.showcaseSlot));
    const freeSlot = [1, 2, 3].find((slot) => !usedSlots.has(slot));
    if (freeSlot === undefined) {
      this.notificationService.info('Showcase is full — unpin one first.');
      return;
    }
    this.setShowcaseSlot(achievement.id, freeSlot);
  }

  private setShowcaseSlot(achievementId: string, showcaseSlot: number | null): void {
    this.achievementService.setShowcaseSlot(achievementId, showcaseSlot).subscribe({
      next: (updated) => {
        // Pinning into an occupied slot unpins its previous occupant server-side.
        this.achievements.update((list) =>
          list.map((a) => {
            if (a.id === updated.id) {
              return updated;
            }
            return showcaseSlot != null && a.showcaseSlot === showcaseSlot ? { ...a, showcaseSlot: undefined } : a;
          }),
        );
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update showcase. Please try again.')),
    });
  }

  private loadSummary(): void {
    this.achievementService.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => void 0,
    });
  }

  /** "Post 100 clips — 48 to go"; descriptions that state their own progress stand alone. */
  progressCaption(achievement: AchievementModel): string {
    const description = achievementDescription(achievement);
    if (describesOwnProgress(achievement)) {
      return description;
    }
    return `${description} — ${Math.max(0, achievement.ruleThreshold - achievement.progressCurrent)} to go`;
  }

  /** "7-day posting streak · 2 gün önce". */
  earnedCaption(achievement: AchievementModel): string {
    return `${achievementDescription(achievement)} · ${earnedAgo(achievement.earnedAt!, this.now)}`;
  }

  rarity(achievement: AchievementModel): string {
    return rarityLabel(achievement);
  }

  progressPercent(achievement: AchievementModel): number {
    if (achievement.ruleThreshold <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((achievement.progressCurrent / achievement.ruleThreshold) * 100));
  }

  isCurrentUser(userId: string): boolean {
    return userId === this.authService.currentUser()?.id;
  }

  /** The design keeps the rows down to and including yours bright, the rest muted. */
  isBrightRank(index: number): boolean {
    const mine = this.myRank();
    return mine === 0 ? index === 0 : index < mine;
  }
}
