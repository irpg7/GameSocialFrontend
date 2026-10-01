import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadModel } from '../../../../models/squad.model';
import { foundedTr } from '../squad-format';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';

/**
 * Squad room banner, from `onSquad` (05-squad.html L79–97): 168px band (the
 * squad's own banner upload, else its main game's cover), 120px bottom fade,
 * back arrow + 74px squad icon, name + red LV badge, the
 * "7 üye · 4 çevrimiçi · Ashfall & Depths of Ur · Mart’ta kuruldu" meta line,
 * and the action row (post to squad / back to feed / settings).
 */
@Component({
  selector: 'app-squad-banner',
  imports: [ImgFallback, RouterLink],
  templateUrl: './squad-banner.html',
  styleUrl: './squad-banner.scss',
})
export class SquadBanner {
  squad = input.required<SquadModel>();
  canPost = input(false);
  /** Live roster count (presence updates) — falls back to the squad payload's count. */
  onlineCount = input<number | null>(null);

  postToSquad = output<void>();
  openSettings = output<void>();

  /** Backend returns '' (not null) when a game has no cover — treat both as absent. */
  /** The backend's default poster is a portrait "no cover" card — stretched into the band it reads as broken. */
  protected readonly bannerUrl = computed(() => {
    const cover = this.squad().primaryGameCoverImageUrl;
    return this.squad().bannerUrl || (cover && !cover.includes('placeholder-game-poster') ? cover : null);
  });

  protected readonly meta = computed(() => {
    const squad = this.squad();
    const online = this.onlineCount() ?? squad.onlineCount;
    const parts = [`${squad.memberCount} üye`, `${online} çevrimiçi`];
    const games = squad.games.map((game) => game.name);
    if (games.length > 0) {
      parts.push(games.join(' & '));
    }
    parts.push(foundedTr(squad.createdAt));
    return parts.filter(Boolean).join(' · ');
  });
}
