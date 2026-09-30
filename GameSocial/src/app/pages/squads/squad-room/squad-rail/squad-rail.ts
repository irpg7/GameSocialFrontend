import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PresenceName, SquadLeaderboardEntryModel, SquadMemberModel } from '../../../../models/squad.model';
import { leftAgoTr, thousands } from '../squad-format';

interface BoardRow {
  rank: number;
  self: boolean;
  entry: SquadLeaderboardEntryModel;
}

/** The design's board shows four rows. */
const BOARD_ROWS = 4;

/**
 * Squad room right rail (05-squad.html L257–288): the Roster panel ("N
 * online", presence dot per avatar — green / amber quiet / grey offline —
 * CAP tag, live status line: current activity, "sessiz mod", or "2 gün önce
 * çıktı"; offline rows dimmed) with the dashed invite action, and "This
 * week's board" (top four by XP earned in the last 7 days, your row
 * highlighted).
 */
@Component({
  selector: 'app-squad-rail',
  imports: [RouterLink],
  templateUrl: './squad-rail.html',
  styleUrl: './squad-rail.scss',
})
export class SquadRail {
  roster = input.required<SquadMemberModel[]>();
  leaderboard = input.required<SquadLeaderboardEntryModel[]>();
  currentUserId = input<string | undefined>(undefined);
  rosterError = input<string | null>(null);
  leaderboardError = input<string | null>(null);

  invite = output<void>();

  protected readonly onlineCount = computed(
    () => this.roster().filter((member) => member.presence && member.presence !== 'offline').length,
  );

  protected readonly board = computed<BoardRow[]>(() => {
    const me = this.currentUserId();
    const rows = this.leaderboard().map((entry, index) => ({ rank: index + 1, self: entry.userId === me, entry }));
    const top = rows.slice(0, BOARD_ROWS);
    const mine = rows.find((row) => row.self);
    if (mine && !top.includes(mine)) {
      top[top.length - 1] = mine;
    }
    return top;
  });

  protected format(value: number): string {
    return thousands(value);
  }

  protected presenceLabel(presence: PresenceName | undefined): string {
    switch (presence) {
      case 'online':
        return 'Çevrimiçi';
      case 'away':
        return 'Sessiz mod';
      case 'dnd':
        return 'Rahatsız etmeyin';
      default:
        return 'Çevrimdışı';
    }
  }

  /** "Sen · LV 24 · çevrimiçi" / "Ashfall · Boss 7 · 2. deneme" / "… · sessiz mod" / "2 gün önce çıktı" */
  protected status(member: SquadMemberModel): string {
    const presence = member.presence ?? 'offline';
    if (presence === 'offline') {
      return leftAgoTr(member.lastSeenAt);
    }
    const level = member.level ? `LV ${member.level}` : null;
    if (member.userId === this.currentUserId()) {
      return ['Sen', level, presence === 'online' ? 'çevrimiçi' : this.presenceLabel(presence).toLowerCase()]
        .filter(Boolean)
        .join(' · ');
    }
    const activity = member.currentActivity?.trim();
    if (presence === 'online') {
      return activity || [level, 'çevrimiçi'].filter(Boolean).join(' · ');
    }
    const suffix = presence === 'away' ? 'sessiz mod' : 'rahatsız etmeyin';
    return activity ? `${activity} · ${suffix}` : suffix;
  }
}
