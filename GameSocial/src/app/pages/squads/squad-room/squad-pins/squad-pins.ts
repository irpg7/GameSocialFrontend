import { Component, computed, input, output } from '@angular/core';
import { SquadGuideModel } from '../../../../models/squad.model';
import { agoEn } from '../squad-format';

/**
 * "◫ Pinned guides" tab, `onSquad` + `onPinned` (05-squad.html L181–206):
 * the featured guide as the PINNED card (120×80 cover, "author · updated 2 h
 * ago", title, description, "2 clips / 4 screens / game" chips), the other
 * guides as compact rows ("author · 1 clip, 3 screens" · Open), then the
 * dashed "＋ Pin a guide from #genel". Backed by GET /squads/{id}/guides.
 */
@Component({
  selector: 'app-squad-pins',
  templateUrl: './squad-pins.html',
  styleUrl: './squad-pins.scss',
})
export class SquadPins {
  guides = input.required<SquadGuideModel[]>();
  isLoading = input(false);
  canCreate = input(false);
  /** The squad's first channel — "Pin a guide from #genel". */
  channelName = input('genel');

  openGuide = output<SquadGuideModel>();
  createGuide = output<void>();

  protected readonly featured = computed(
    () => this.guides().find((guide) => guide.isFeatured) ?? this.guides()[0] ?? null,
  );
  protected readonly rest = computed(() => this.guides().filter((guide) => guide !== this.featured()));

  protected updated(iso: string): string {
    return agoEn(iso);
  }

  /** "6 screens" / "1 clip, 3 screens" */
  protected assets(guide: SquadGuideModel): string {
    const parts: string[] = [];
    if (guide.clipCount > 0) {
      parts.push(`${guide.clipCount} clip${guide.clipCount === 1 ? '' : 's'}`);
    }
    if (guide.screenCount > 0) {
      parts.push(`${guide.screenCount} screen${guide.screenCount === 1 ? '' : 's'}`);
    }
    return parts.join(', ');
  }
}
