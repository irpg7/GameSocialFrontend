import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { AchievementModel } from '../../models/achievement.model';
import { achievementDescription, rarityLabel } from './trophy-format';

/**
 * The design's showcase tile ("Showcase — pinned to your profile"): a centred
 * 54px glyph, name, one-line description and a monospace "N% HAVE THIS"
 * badge. `accent` lights it red (the design lights the rarest one). Shared by
 * the Trophies page and the profile page. When `editable`, the tile is a
 * button that emits `activate` (pin/unpin).
 */
@Component({
  selector: 'app-trophy-tile',
  template: `
    @if (editable()) {
      <button type="button" class="trophy-tile editable" [class.accent]="accent()" [attr.aria-label]="'Unpin ' + achievement().name" (click)="activate.emit()">
        <ng-container [ngTemplateOutlet]="body" />
        <span class="trophy-tile-action">Unpin</span>
      </button>
    } @else {
      <div class="trophy-tile" [class.accent]="accent()">
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
    <ng-template #body>
      <span class="trophy-tile-icon" aria-hidden="true">{{ achievement().icon }}</span>
      <span class="trophy-tile-name">{{ achievement().name }}</span>
      <span class="trophy-tile-desc">{{ description() }}</span>
      <span class="trophy-tile-rarity">{{ rarity() }}</span>
    </ng-template>
  `,
  styleUrl: './trophy-tile.scss',
  imports: [NgTemplateOutlet],
})
export class TrophyTile {
  readonly achievement = input.required<AchievementModel>();
  readonly accent = input(false);
  readonly editable = input(false);
  readonly activate = output<void>();

  protected readonly description = computed(() => achievementDescription(this.achievement()));
  protected readonly rarity = computed(() => rarityLabel(this.achievement()));
}
