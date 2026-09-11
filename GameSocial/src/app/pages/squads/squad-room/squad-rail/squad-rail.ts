import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadLeaderboardEntryModel, SquadMemberModel } from '../../../../models/squad.model';
import { formatTimeAgo } from '../../../../shared/clip-format';

/** A roster row: membership merged with the member's leaderboard standing. */
export interface RosterEntry extends SquadMemberModel {
  /** null when the leaderboard has not loaded (or failed). */
  level: number | null;
  xp: number | null;
}

/**
 * Squad room right rail, from Gamer Feed.dc.html `onSquad`: a Roster panel
 * (avatar + level tag + status line per member, with a dashed invite action)
 * and a standings panel underneath.
 *
 * Two honest departures from the mock:
 *  - the presence dot, the "N online" counter and the "in-game" status text
 *    have no data source (no presence tracking anywhere in the stack), so the
 *    counter shows the member count and the second line shows the member's
 *    role and join date instead;
 *  - the mock's panel is titled "This week's board", but no weekly XP delta is
 *    stored — not even derivable, since only a running total exists — so it is
 *    labelled "All-time board" rather than mislabelling all-time data.
 */
@Component({
  selector: 'app-squad-rail',
  imports: [RouterLink],
  templateUrl: './squad-rail.html',
  styleUrl: './squad-rail.scss',
})
export class SquadRail {
  roster = input.required<RosterEntry[]>();
  leaderboard = input.required<SquadLeaderboardEntryModel[]>();
  currentUserId = input<string | undefined>(undefined);
  isCaptain = input(false);
  rosterError = input<string | null>(null);
  leaderboardError = input<string | null>(null);

  invite = output<void>();
  manageMembers = output<void>();

  protected initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  protected joined(iso: string): string {
    return formatTimeAgo(iso);
  }

  protected isSelf(userId: string): boolean {
    return userId === this.currentUserId();
  }
}
