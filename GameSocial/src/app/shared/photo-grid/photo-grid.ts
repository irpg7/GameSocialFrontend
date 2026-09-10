import { Component, computed, input, output } from '@angular/core';
import { PostMediaModel } from '../../models/post.model';

/**
 * The design's photo post card never shows more than five tiles at once —
 * the eight-photo card renders 1.6/1/1 columns and hides the rest behind a
 * "+N" overlay on the bottom-right tile.
 */
const MAX_VISIBLE_PHOTOS = 5;

/**
 * The photo grid from `Gamer Feed.dc.html` (the eight-photo post card and its
 * three-tile sibling), generalised over the photo count: 1-4 photos each get
 * their own template and 5+ share the design's five-tile skeleton. Geometry
 * (3px gutters, the 236px band, the 1.6/1/1 columns) is the design's own.
 */
@Component({
  selector: 'app-photo-grid',
  templateUrl: './photo-grid.html',
  styleUrl: './photo-grid.scss',
  host: {
    '[attr.data-count]': 'layoutCount()',
  },
})
export class PhotoGrid {
  photos = input.required<PostMediaModel[]>();
  /** Alt text for every tile — the post caption, when it has one. */
  alt = input('');
  /** Top-left chip on the lead tile, the design's "4K · HDR" slot. */
  badge = input<string | undefined>(undefined);

  /** Index into the *full* photo list, so the viewer can open a hidden one from the "+N" tile. */
  open = output<number>();

  protected readonly visible = computed(() => this.photos().slice(0, MAX_VISIBLE_PHOTOS));
  protected readonly hiddenCount = computed(() => Math.max(0, this.photos().length - MAX_VISIBLE_PHOTOS));
  /** Selects the layout template; every count above five reuses the five-tile one. */
  protected readonly layoutCount = computed(() => Math.min(this.photos().length, MAX_VISIBLE_PHOTOS));

  protected tileLabel(index: number): string {
    const total = this.photos().length;
    // The "+N" tile stands in for everything that did not fit, so it announces the whole set.
    if (this.hiddenCount() > 0 && index === this.visible().length - 1) {
      return `Show all ${total} photos`;
    }
    return `Open photo ${index + 1} of ${total}`;
  }
}
