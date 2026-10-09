import { Component, OnDestroy, computed, input, linkedSignal, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostMediaModel } from '../../models/post.model';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { BackdropClose } from '../overlay/backdrop-close';
import { DialogFocus } from '../overlay/dialog-focus';

/**
 * The `phViewer` state of `Gamer Feed.dc.html`'s photo post card: a full-screen
 * lightbox with the author row and photo index on top, prev/next arrows around
 * the frame, the game/mode chips over its bottom-left corner, and the thumbnail
 * strip underneath.
 *
 * The parent owns visibility (wrap usage in an `@if`) and hands over the tile
 * that was clicked; navigating within the set belongs to the viewer.
 *
 * "◇ Save all" / "◆ Saved" is the post-level save toggle: the parent owns the
 * state (`saved`) and the request (`saveToggle`).
 */
@Component({
  selector: 'app-photo-viewer',
  imports: [ImgFallback, RouterLink, BackdropClose, DialogFocus],
  templateUrl: './photo-viewer.html',
  styleUrl: './photo-viewer.scss',
  host: {
    '(document:keydown.arrowleft)': 'prev()',
    '(document:keydown.arrowright)': 'next()',
  },
})
export class PhotoViewer implements OnDestroy {
  photos = input.required<PostMediaModel[]>();
  /** Tile the viewer was opened from; re-opening on another tile re-seeds the position. */
  startIndex = input.required<number>();
  username = input.required<string>();
  userId = input.required<string>();
  gameName = input<string | undefined>(undefined);
  caption = input<string | undefined>(undefined);
  /** "LV 41" chip next to the author. */
  authorLevel = input<number | undefined>(undefined);
  authorAvatarUrl = input<string | undefined>(undefined);
  saved = input(false);
  saveToggle = output<void>();

  closed = output<void>();


  protected readonly current = linkedSignal(() => this.startIndex());

  protected readonly active = computed(() => this.photos()[this.current()]);
  protected readonly initial = computed(() => this.username().charAt(0).toUpperCase());
  protected readonly indexLabel = computed(() => `${this.current() + 1} / ${this.photos().length}`);
  protected readonly hasMany = computed(() => this.photos().length > 1);
  /** The design's second chip is the capture spec ("3840×2160 · f/1.8"): the real pixel size, else the photo's kind. */
  protected readonly kindLabel = computed(() => {
    const photo = this.active();
    const kind = photo?.photoType === 'ConceptArt' ? 'Concept art' : 'Photo mode';
    return photo?.width && photo?.height ? `${photo.width}×${photo.height} · ${kind}` : kind;
  });

  constructor() {
    // The lightbox covers the page, so the feed behind it must not scroll away under it.
    // Focus, the Tab trap and Escape are handled by `appDialog`.
    document.body.classList.add('photo-viewer-open');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('photo-viewer-open');
  }

  protected prev(): void {
    const total = this.photos().length;
    this.current.update((index) => (index - 1 + total) % total);
  }

  protected next(): void {
    const total = this.photos().length;
    this.current.update((index) => (index + 1) % total);
  }

  protected select(index: number): void {
    this.current.set(index);
  }
}
