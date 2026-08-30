import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { AchievementService } from '../../services/achievement/achievement.service';
import { MeService } from '../../services/me/me.service';
import { SquadService } from '../../services/squad/squad.service';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { AchievementModel } from '../../models/achievement.model';
import { SquadLeaderboardEntryModel, SquadModel } from '../../models/squad.model';

/**
 * Real XP award amounts, mirrored from Domain/Constants/AppConstants.XpAwards
 * (confirmed by reading the backend source directly) — not decorative copy.
 */
const XP_AWARDS = [
  { label: 'Clip', amount: 120 },
  { label: 'Devlog', amount: 150 },
  { label: 'Screenshot set', amount: 80 },
  { label: 'Review', amount: 200 },
  { label: 'Like/Useful vote received', amount: 5 },
];

type SortMode = 'default' | 'rarest';

/**
 * Real Trophies page (Phase 3), replacing the Phase 1 placeholder.
 * GET /api/achievements takes no query params (confirmed by reading
 * ListAchievementsEndpoint directly) — the spec's "real query param" filter
 * assumption doesn't hold here, so the game filter/rarest-first sort are
 * both applied client-side over the one fetched list.
 */
@Component({
  selector: 'app-trophies',
  imports: [RouterLink],
  templateUrl: './trophies.html',
  styleUrl: './trophies.scss',
})
export class Trophies implements OnInit {
  private achievementService = inject(AchievementService);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  protected readonly authService = inject(AuthService);
  protected readonly meService = inject(MeService);

  protected readonly xpAwards = XP_AWARDS;

  protected readonly achievements = signal<AchievementModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly editMode = signal(false);
  protected readonly gameFilter = signal<number | 'all'>('all');
  protected readonly sortMode = signal<SortMode>('default');

  protected readonly mySquad = signal<SquadModel | null>(null);
  protected readonly leaderboard = signal<SquadLeaderboardEntryModel[]>([]);

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

  protected readonly earnedCount = computed(() => this.achievements().filter((a) => a.earnedAt).length);
  protected readonly inProgressList = computed(() =>
    this.filteredAchievements()
      .filter((a) => !a.earnedAt && a.progressCurrent > 0)
      .sort((a, b) => b.progressCurrent / b.ruleThreshold - a.progressCurrent / a.ruleThreshold),
  );

  protected readonly showcased = computed(() =>
    [...this.achievements()]
      .filter((a) => a.showcaseSlot != null)
      .sort((a, b) => (a.showcaseSlot ?? 0) - (b.showcaseSlot ?? 0)),
  );

  protected readonly recentlyEarned = computed(() =>
    this.filteredAchievements()
      .filter((a) => a.earnedAt)
      .sort((a, b) => new Date(b.earnedAt!).getTime() - new Date(a.earnedAt!).getTime()),
  );

  ngOnInit(): void {
    this.achievementService.getAll().subscribe({
      next: (achievements) => {
        this.achievements.set(achievements);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });

    this.squadService
      .getMine()
      .pipe(
        switchMap((squads) => {
          const first = squads[0];
          if (!first) {
            return of(null);
          }
          this.mySquad.set(first);
          return this.squadService.getLeaderboard(first.id);
        }),
      )
      .subscribe({
        next: (entries) => {
          if (entries) {
            this.leaderboard.set(entries);
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

  private setShowcaseSlot(achievementId: number, showcaseSlot: number | null): void {
    this.achievementService.setShowcaseSlot(achievementId, showcaseSlot).subscribe({
      next: (updated) => {
        this.achievements.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      },
      error: () => this.notificationService.error('Failed to update showcase. Please try again.'),
    });
  }

  progressToGo(achievement: AchievementModel): number {
    return Math.max(0, achievement.ruleThreshold - achievement.progressCurrent);
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
}
