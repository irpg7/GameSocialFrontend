import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SquadChannelModel, SquadModel } from '../../../../models/squad.model';

/**
 * The squad room's left sidebar, from Gamer Feed.dc.html `onSquad`: a
 * "Your squads" switcher, a dashed "＋ New squad" action, then the channel
 * list. This is what replaces the old standalone `/squads` list page — the
 * design puts squad switching and squad creation here, inside the room.
 *
 * Three things the mock shows on each squad card are deliberately absent
 * because no API backs them, and inventing numbers would be worse than
 * omitting them: the green presence dot with "N online", the squad LV chip,
 * and the unread badges ("2 yeni klip" / "5 mesaj"). The card's geometry —
 * 34px mark, two-line identity block, right-aligned meta slot — is kept, and
 * filled with real data: member count and the squad's main game.
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
  /** Only captains can create channels (server-enforced). */
  canAddChannel = input(false);

  channelPicked = output<string>();
  createSquad = output<void>();
  addChannel = output<void>();

  protected initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  protected memberLabel(squad: SquadModel): string {
    return `${squad.memberCount} member${squad.memberCount === 1 ? '' : 's'}`;
  }
}
