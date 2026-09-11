import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadModel } from '../../../../models/squad.model';

/**
 * Squad room banner, from Gamer Feed.dc.html `onSquad`: a 168px image band
 * with a bottom fade, a back arrow, the 74px squad mark overlapping the fade,
 * the name + meta line, and the action row (post to squad / back to feed /
 * settings).
 *
 * The design's banner artwork has no backing column — there is no squad image
 * upload — so the band uses the squad's main-game cover, which is real data.
 * With no main game it falls back to the accent gradient rather than showing
 * an empty grey box.
 *
 * The LV badge beside the name is omitted: the domain has no squad level or
 * squad XP, and "sum of members' all-time XP" would be an invented metric.
 * Member LV chips elsewhere in the room are real (server-computed, from the
 * leaderboard).
 */
@Component({
  selector: 'app-squad-banner',
  imports: [RouterLink],
  templateUrl: './squad-banner.html',
  styleUrl: './squad-banner.scss',
})
export class SquadBanner {
  squad = input.required<SquadModel>();
  /** Captains get the settings gear; members get a read-only view of it. */
  canPost = input(false);

  postToSquad = output<void>();
  openSettings = output<void>();

  protected readonly initial = computed(() => this.squad().name.charAt(0).toUpperCase());

  /** Backend returns '' (not null) when a game has no cover — treat both as absent. */
  protected readonly coverUrl = computed(() => this.squad().primaryGameCoverImageUrl || null);

  protected readonly meta = computed(() => {
    const squad = this.squad();
    const parts = [`${squad.memberCount} member${squad.memberCount === 1 ? '' : 's'}`];
    if (squad.primaryGameName) {
      parts.push(squad.primaryGameName);
    }
    if (squad.description) {
      parts.push(squad.description);
    }
    return parts.join(' · ');
  });
}
