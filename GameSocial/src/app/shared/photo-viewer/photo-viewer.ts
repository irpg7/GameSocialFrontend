import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostMediaModel } from '../../models/post.model';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

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
  imports: [ImgFallback, RouterLink],
  templateUrl: './photo-viewer.html',
  styleUrl: './photo-viewer.scss',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:keydown.arrowleft)': 'prev()',
    '(document:keydown.arrowright)': 'next()',
  },
})
export class PhotoViewer implements OnDestroy {
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

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

  private readonly closeRef = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

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
    document.body.classList.add('photo-viewer-open');
    afterNextRender(() => this.closeRef().nativeElement.focus());
  }

  ngOnDestroy(): void {
    document.body.classList.remove('photo-viewer-open');
    this.previouslyFocused?.focus();
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

  /** A click on the backdrop itself (never on the chrome inside it) dismisses the viewer. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  /** Keeps Tab inside the lightbox while it is open. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(this.hostRef.nativeElement.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
      (element) => element.offsetParent !== null,
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
