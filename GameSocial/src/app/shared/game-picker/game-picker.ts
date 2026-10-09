import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormValueControl } from '@angular/forms/signals';
import { Subscription, debounceTime, distinctUntilChanged, skip } from 'rxjs';
import { GameListQuery, GameModel } from '../../models/game.model';
import { GameService } from '../../services/game/game.service';
import { GameLookup } from '../../services/game/game-lookup.service';
import { extractApiErrorMessage } from '../api-error.util';
import { ImgFallback } from '../img-fallback/img-fallback';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 200;

/** Server-side narrowing a picker can ask for (the catalogue is paged, so it can't filter locally). */
export type GamePickerFilter = Pick<GameListQuery, 'ownedByMe' | 'notReviewedByMe'>;

/**
 * Searchable game picker. The catalogue is paged (GET /api/games), so pickers no longer get every game
 * up front. It is a Signal Forms control: `[formField]` binds the game id as text ('' = none), like the
 * `<select>`s it replaces. Put the old select's box classes on the host (`class="field-box"`); the
 * field draws inside that box.
 *
 * Opening it lists the games you follow first, then the rest A–Z, and loads more on scroll; typing
 * searches the server. The list renders in the top layer (popover) so a scrolling sheet body can't clip it.
 */
@Component({
  selector: 'app-game-picker',
  imports: [ImgFallback],
  templateUrl: './game-picker.html',
  styleUrl: './game-picker.scss',
  host: {
    '[class.open]': 'isOpen()',
    '[class.disabled]': 'disabled()',
  },
})
export class GamePicker implements FormValueControl<string> {
  private gameService = inject(GameService);
  private lookup = inject(GameLookup);
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private destroyRef = inject(DestroyRef);

  readonly value = model('');
  readonly disabled = input(false);
  readonly touch = output<void>();

  inputId = input.required<string>();
  /** Accessible name when no visible label points at `inputId`. */
  ariaLabel = input<string | null>(null);
  placeholder = input('Search a game');
  /** Text of the "no game" row and of the empty field; null = a game must be picked (no such row). */
  noneLabel = input<string | null>(null);
  filter = input<GamePickerFilter>({});
  /** Shown when the filtered catalogue is empty (e.g. "You've reviewed every game"). */
  emptyHint = input('No games found.');

  /** The picked game (null for "none"), for callers that need more than the id. */
  picked = output<GameModel | null>();

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly options = signal<GameModel[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly activeIndex = signal(-1);
  private readonly page = signal(1);
  private readonly selected = signal<GameModel | null>(null);
  private request?: Subscription;

  protected readonly listId = computed(() => `${this.inputId()}-list`);
  protected readonly selectedId = computed(() => (this.value() ? Number(this.value()) : null));
  /** The "none" row counts as option 0 while it is shown (only with an empty query). */
  protected readonly showNoneRow = computed(() => this.noneLabel() !== null && !this.query().trim());
  private readonly rowOffset = computed(() => (this.showNoneRow() ? 1 : 0));
  /** What the closed field shows; with no game the placeholder (`noneLabel`) shows instead. */
  protected readonly displayText = computed(() => this.selected()?.name ?? '');

  constructor() {
    // Resolve the bound id to a name (preselected values, values restored from drafts).
    effect(() => {
      const id = this.selectedId();
      untracked(() => this.resolveSelected(id));
    });

    toObservable(this.query)
      .pipe(skip(1), debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        if (this.isOpen()) {
          this.load(true);
        }
      });

    // Keep the input showing the selection while closed.
    afterRenderEffect(() => {
      const text = this.displayText();
      if (!this.isOpen()) {
        const el = this.field().nativeElement;
        if (el.value !== text) {
          el.value = text;
        }
      }
    });

    // Top-layer list positioned under the field; follows scrolling/resizing while open.
    afterRenderEffect(() => {
      const list = this.list()?.nativeElement;
      if (!list || !this.isOpen()) {
        return;
      }
      if (typeof list.showPopover === 'function' && !list.matches(':popover-open')) {
        list.showPopover();
      }
      this.position();
    });

    const reposition = () => {
      if (this.isOpen()) {
        this.position();
      }
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      this.request?.unsubscribe();
    });
  }

  protected open(): void {
    if (this.disabled() || this.isOpen()) {
      return;
    }
    this.isOpen.set(true);
    this.query.set('');
    this.field().nativeElement.value = '';
    this.activeIndex.set(-1);
    this.load(true);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.request?.unsubscribe();
    this.isLoading.set(false);
    this.field().nativeElement.value = this.displayText();
    this.touch.emit();
  }

  protected onInput(text: string): void {
    if (!this.isOpen()) {
      this.open();
    }
    this.query.set(text);
    this.activeIndex.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.rowOffset() + this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) {
          this.open();
          return;
        }
        this.activeIndex.update((i) => Math.min(i + 1, count - 1));
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        this.scrollActiveIntoView();
        break;
      case 'Enter':
        if (this.isOpen()) {
          event.preventDefault();
          this.pickIndex(this.activeIndex() >= 0 ? this.activeIndex() : this.rowOffset());
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          // The sheet listens for Escape on document; preventDefault keeps it open (DialogFocus).
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected onListScroll(target: HTMLElement): void {
    if (this.hasMore() && !this.isLoading() && target.scrollTop + target.clientHeight >= target.scrollHeight - 48) {
      this.load(false);
    }
  }

  protected rowIndex(optionIndex: number): number {
    return optionIndex + this.rowOffset();
  }

  protected pickNone(): void {
    this.commit(null);
  }

  protected pick(game: GameModel): void {
    this.commit(game);
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-opt-${index}`;
  }

  protected retry(): void {
    this.load(this.options().length === 0);
  }

  private resolveSelected(id: number | null): void {
    if (id === null) {
      this.selected.set(null);
      return;
    }
    if (this.selected()?.id === id) {
      return;
    }
    const known = this.lookup.get(id);
    if (known) {
      this.selected.set(known);
      return;
    }
    this.lookup
      .resolve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (game) => {
          if (this.selectedId() === id) {
            this.selected.set(game);
          }
        },
        // The field just stays blank; picking again still works.
        error: () => void 0,
      });
  }

  private pickIndex(index: number): void {
    if (index < 0) {
      return;
    }
    if (this.showNoneRow() && index === 0) {
      this.pickNone();
      return;
    }
    const game = this.options()[index - this.rowOffset()];
    if (game) {
      this.pick(game);
    }
  }

  private commit(game: GameModel | null): void {
    this.selected.set(game);
    this.value.set(game ? String(game.id) : '');
    this.picked.emit(game);
    this.close();
  }

  private load(reset: boolean): void {
    this.request?.unsubscribe();
    const page = reset ? 1 : this.page() + 1;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.request = this.gameService
      .list({
        ...this.filter(),
        search: this.query().trim() || undefined,
        followedFirst: true,
        page,
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.lookup.remember(result.items);
          this.options.update((current) => (reset ? result.items : [...current, ...result.items]));
          this.page.set(page);
          this.hasMore.set(result.hasMore);
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(extractApiErrorMessage(err, 'Could not load games.'));
        },
      });
  }

  private position(): void {
    const list = this.list()?.nativeElement;
    if (!list) {
      return;
    }
    const rect = this.host.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const width = Math.max(rect.width, 220);
    list.style.minWidth = `${width}px`;
    list.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    if (spaceBelow < 220 && rect.top > spaceBelow) {
      list.style.top = 'auto';
      list.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    } else {
      list.style.bottom = 'auto';
      list.style.top = `${rect.bottom + 6}px`;
    }
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() => document.getElementById(this.optionId(this.activeIndex()))?.scrollIntoView({ block: 'nearest' }));
  }
}
