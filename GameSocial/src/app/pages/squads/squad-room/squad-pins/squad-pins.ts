import { Component, computed, input, output } from '@angular/core';
import { PinnedSquadMessageModel } from '../../../../models/squad.model';
import { formatTimeAgo } from '../../../../shared/clip-format';

/**
 * Pinned tab of the squad room, from Gamer Feed.dc.html `onSquad` +
 * `onPinned`: the newest pin as a featured card (cover, PINNED badge,
 * author + updated line, body, meta chips), the rest as compact rows with an
 * "Open" affordance, then a dashed hint.
 *
 * The mock frames these as multi-asset "guides" with their own clip/screen
 * counts; what actually exists is a pinned chat message, so each pin is
 * rendered from real message data (its channel, its author, its shared post's
 * type and game). The geometry is the mock's.
 *
 * Backed by `GET /squads/{id}/pins`, which returns pins across every channel
 * in one request — this used to page through every channel client-side.
 */
@Component({
  selector: 'app-squad-pins',
  templateUrl: './squad-pins.html',
  styleUrl: './squad-pins.scss',
})
export class SquadPins {
  pins = input.required<PinnedSquadMessageModel[]>();
  isLoading = input(false);

  /** Jumps to the Chat tab focused on the pin's own channel. */
  openPin = output<PinnedSquadMessageModel>();
  goToChat = output<void>();

  protected readonly featured = computed(() => this.pins()[0] ?? null);
  protected readonly rest = computed(() => this.pins().slice(1));

  protected when(iso: string): string {
    return formatTimeAgo(iso);
  }

  protected title(pin: PinnedSquadMessageModel): string {
    const body = pin.body?.trim();
    if (body) {
      return body;
    }
    const caption = pin.sharedPost?.caption?.trim();
    if (caption) {
      return caption;
    }
    return 'Shared ' + (pin.sharedPost?.postType ?? 'post');
  }
}
