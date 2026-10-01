import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadModel } from '../../../models/squad.model';
import { SquadWeeklyStatsModel } from '../../../models/squad-hub.model';
import { formatNumber, levelPercent, plural, squadMeta } from './hub-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

/**
 * "Your squads" row (expl.html 2a): 72px icon, name + role badge + meta,
 * description, SQUAD LEVEL bar and weekly chips, and "Open room" / "Invite".
 * Founders/admins get the primary "Open room" plus "Invite"; members get an
 * outline "Open room" only — as in the design's two rows.
 */
@Component({
  selector: 'app-hub-squad-card',
  imports: [ImgFallback, RouterLink],
  template: `
    <article class="squad">
      <span class="squad-icon" aria-hidden="true">
        <img [appImg]="squad().iconUrl" fallback="squad" alt="" />
      </span>

      <div class="squad-body">
        <div class="squad-head">
          <h3 class="squad-name">{{ squad().name }}</h3>
          @if (roleBadge(); as badge) {
            <span class="squad-badge">{{ badge }}</span>
          }
          <span class="squad-meta">{{ meta() }}</span>
        </div>
        @if (squad().description) {
          <p class="squad-desc">{{ squad().description }}</p>
        }
        <div class="squad-progress">
          <div class="squad-level">
            <div class="squad-level-row">
              <span>SQUAD LEVEL {{ squad().level }}</span>
              <span class="squad-level-xp">{{ xpLabel() }}</span>
            </div>
            <div
              class="squad-level-track"
              role="progressbar"
              [attr.aria-label]="'Squad level ' + squad().level + ' progress'"
              aria-valuemin="0"
              [attr.aria-valuemax]="squad().xpForNextLevel"
              [attr.aria-valuenow]="squad().xp">
              <span class="squad-level-fill" [style.width.%]="percent()"></span>
            </div>
          </div>
          @if (chips().length > 0) {
            <div class="squad-chips">
              @for (chip of chips(); track chip) {
                <span class="squad-chip">{{ chip }}</span>
              }
            </div>
          }
        </div>
      </div>

      <div class="squad-actions">
        <a class="squad-btn" [class.primary]="canManage()" [routerLink]="['/squads', squad().id]">Open room</a>
        @if (canManage()) {
          <button type="button" class="squad-btn" (click)="invite.emit()">Invite</button>
        }
      </div>
    </article>
  `,
  styleUrl: './hub-squad-card.scss',
})
export class HubSquadCard {
  squad = input.required<SquadModel>();
  stats = input<SquadWeeklyStatsModel | undefined>(undefined);
  invite = output<void>();

  protected readonly meta = computed(() => squadMeta(this.squad()));
  protected readonly percent = computed(() => levelPercent(this.squad()));
  protected readonly xpLabel = computed(
    () => `${formatNumber(this.squad().xp)} / ${formatNumber(this.squad().xpForNextLevel)}`,
  );
  protected readonly canManage = computed(() => {
    const role = this.squad().currentUserRole;
    return role === 'Captain' || role === 'Admin';
  });
  protected readonly roleBadge = computed(() => {
    const role = this.squad().currentUserRole;
    return role === 'Captain' ? 'CAPTAIN' : role === 'Admin' ? 'ADMIN' : null;
  });

  /** "3 clips this week", "2 trophies", "You rank #4" — only the ones with something to say. */
  protected readonly chips = computed(() => {
    const stats = this.stats();
    if (!stats) {
      return [];
    }
    const chips: string[] = [];
    if (stats.clipsThisWeek > 0) {
      chips.push(`${plural(stats.clipsThisWeek, 'clip', 'clips')} this week`);
    }
    if (stats.trophiesThisWeek > 0) {
      chips.push(plural(stats.trophiesThisWeek, 'trophy', 'trophies'));
    }
    if (stats.myWeeklyRank && this.squad().memberCount > 1) {
      chips.push(`You rank #${stats.myWeeklyRank}`);
    }
    return chips;
  });
}
