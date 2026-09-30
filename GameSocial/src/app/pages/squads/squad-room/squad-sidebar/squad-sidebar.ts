import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadChannelModel, SquadLatestActivityModel, SquadModel } from '../../../../models/squad.model';
import { agoTr } from '../squad-format';

/**
 * The squad room's left sidebar, from `onSquad` (05-squad.html L22–76):
 * "Squad'larım" switcher cards (icon, name, green dot + "N online", LV chip,
 * activity line, "N yeni klip" / "N mesaj" badges when not selected), the
 * dashed "＋ Yeni squad" action, then the "Kanallar" list with unread pills.
 */
@Component({
  selector: 'app-squad-sidebar',
  imports: [RouterLink],
  templateUrl: './squad-sidebar.html',
  styleUrl: './squad-sidebar.scss',
})
export class SquadSidebar {
  squads = input.required<SquadModel[]>();
  activeSquadId = input.required<string>();
  channels = input.required<SquadChannelModel[]>();
  activeChannelId = input<string | null>(null);
  /** squadId → latest chat event (GET squads/mine/activity). */
  activity = input<Record<string, SquadLatestActivityModel>>({});
  /** Founder/admin only (server-enforced). */
  canAddChannel = input(false);

  channelPicked = output<string>();
  createSquad = output<void>();
  addChannel = output<void>();

  /** "mavikedi az önce 3 klip paylaştı — Boss 7 denemeleri" */
  protected activityLine(squadId: string): string | null {
    const event = this.activity()[squadId];
    if (!event) {
      return null;
    }
    const when = agoTr(event.createdAt);
    if (event.kind === 'Event') {
      return `${event.username} ${when} ${event.body ?? ''} başarımını açtı`.replace(/\s+/g, ' ').trim();
    }
    if (event.kind === 'SharedPost') {
      const count = event.sharedCount > 1 ? `${event.sharedCount} ` : '';
      const noun = event.postType === 'Clip' ? 'klip' : event.postType === 'Screenshots' ? 'ekran görüntüsü' : 'gönderi';
      const caption = event.caption?.trim() ? ` — ${event.caption.trim()}` : '';
      return `${event.username} ${when} ${count}${noun} paylaştı${caption}`;
    }
    return `${event.username}: ${event.body ?? ''}`;
  }
}
