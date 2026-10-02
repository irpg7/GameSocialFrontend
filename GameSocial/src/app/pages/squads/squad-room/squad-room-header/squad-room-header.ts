import { Component, computed, input, output } from '@angular/core';
import { SquadModel } from '../../../../models/squad.model';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';

/**
 * Phone header of the squad room (Tavern Squads — Mobile prototype, "Oda · sohbet"). Replaces the
 * 168px banner on phones: ☰ (squad & channel drawer), squad icon, name + LV, a
 * "● 3 online · #genel ▾" line that also opens the drawer, then members (roster + this week's
 * board sheet) and settings. The topbar is hidden on this route (immersive), so this is the top edge.
 */
@Component({
  selector: 'app-squad-room-header',
  imports: [ImgFallback],
  templateUrl: './squad-room-header.html',
  styleUrl: './squad-room-header.scss',
})
export class SquadRoomHeader {
  squad = input.required<SquadModel>();
  /** Live roster count (presence updates) — falls back to the squad payload's count. */
  onlineCount = input<number | null>(null);
  channelName = input<string | undefined>(undefined);
  drawerOpen = input(false);

  openDrawer = output<void>();
  openMembers = output<void>();
  openSettings = output<void>();

  protected readonly online = computed(() => this.onlineCount() ?? this.squad().onlineCount);
  protected readonly channel = computed(() => this.channelName() ?? 'genel');
}
