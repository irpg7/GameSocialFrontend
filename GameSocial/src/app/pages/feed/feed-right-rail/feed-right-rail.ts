import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { SquadService } from '../../../services/squad/squad.service';
import { MeService } from '../../../services/me/me.service';
import { XpAwardsService } from '../../../services/config/xp-awards.service';
import { FeedActivityService } from '../../../services/feed/feed-activity.service';
import { SquadModel } from '../../../models/squad.model';
import { SquadActivityModel } from '../../../models/squad-activity.model';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/**
 * Feed-page-only right rail (288px): the level/XP card and "Squad activity" —
 * real member events (achievement unlocks, first posts on a game, clips) from
 * `GET /api/feed/squad-activity`, filterable per squad with the chip row.
 */
@Component({
  selector: 'app-feed-right-rail',
  imports: [ImgFallback, RouterLink],
  templateUrl: './feed-right-rail.html',
  styleUrl: './feed-right-rail.scss',
})
export class FeedRightRail {
  private squadService = inject(SquadService);
  private activityService = inject(FeedActivityService);
  private xpAwards = inject(XpAwardsService);
  protected readonly meService = inject(MeService);

  protected readonly squads = signal<SquadModel[]>([]);
  protected readonly selectedSquadId = signal<string | null>(null);
  protected readonly items = signal<SquadActivityModel[]>([]);
  protected readonly isLoading = signal(true);

  /** "Posting a clip is worth 120 XP. Two more and you rank up." — from the server's real awards. */
  protected readonly xpHint = computed(() => {
    const me = this.meService.me();
    const clip = this.xpAwards.amount('clip');
    if (!me || !clip) {
      return '';
    }
    const needed = Math.max(1, Math.ceil(me.xpToNextLevel / clip));
    const count = needed < NUMBER_WORDS.length ? NUMBER_WORDS[needed] : String(needed);
    return `Posting a clip is worth ${clip} XP. ${count} more and you rank up.`;
  });

  /** Where "Open room →" goes: the filtered squad, else your first one. */
  protected readonly roomLink = computed(() => {
    const id = this.selectedSquadId() ?? this.squads()[0]?.id;
    return id ? ['/squads', id] : ['/squads'];
  });

  constructor() {
    this.squadService.getMine().subscribe({
      next: (squads) => this.squads.set(squads),
      error: () => void 0,
    });
    this.load();
  }

  selectSquad(squadId: string | null): void {
    if (this.selectedSquadId() === squadId) {
      return;
    }
    this.selectedSquadId.set(squadId);
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.activityService
      .getSquadActivity(this.selectedSquadId() ?? undefined)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => this.items.set([]),
      });
  }
}
