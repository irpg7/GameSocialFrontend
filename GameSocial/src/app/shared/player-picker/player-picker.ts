import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { FollowService } from '../../services/follow/follow.service';
import { SearchService } from '../../services/search/search.service';
import { AuthService } from '../../services/auth/auth.service';

/** A real account the picker resolved — `username` is the server's exact casing. */
export interface PlayerOption {
  userId: string;
  username: string;
  avatarUrl?: string;
  isFollowed: boolean;
}

const MAX_OPTIONS = 6;
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 8;

/**
 * Username combobox for squad invites. Focusing it lists the people you
 * follow; typing narrows them and, from two characters, also searches every
 * player (GET /api/search). Only real accounts can be picked — Enter on a
 * typed name resolves it case-insensitively first and says so when nobody
 * has that name — so a typo never reaches the create/invite call.
 *
 * The list renders in flow under the input (not floating), so it can't be
 * clipped by the scrolling sheet body it lives in.
 */
@Component({
  selector: 'app-player-picker',
  template: `
    <div class="picker" [class.picker-field]="appearance() === 'field'">
      <input
        #field
        [id]="inputId()"
        class="picker-input"
        type="text"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        [attr.aria-expanded]="isOpen()"
        [attr.aria-controls]="listId()"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-invalid]="error() ? true : null"
        [attr.aria-describedby]="error() ? errorId() : null"
        [placeholder]="placeholder()"
        [value]="query()"
        (input)="onInput(field.value)"
        (focus)="isOpen.set(true)"
        (blur)="isOpen.set(false)"
        (keydown)="onKeydown($event)" />

      @if (isOpen()) {
        <ul class="picker-list" role="listbox" [id]="listId()" [attr.aria-label]="listLabel()">
          @for (option of options(); track option.userId; let i = $index) {
            <li
              class="picker-option"
              role="option"
              [id]="optionId(i)"
              [class.active]="i === activeIndex()"
              [attr.aria-selected]="i === activeIndex()"
              (mousedown)="$event.preventDefault()"
              (click)="pick(option)"
              (mouseenter)="activeIndex.set(i)">
              <span class="picker-avatar" aria-hidden="true">
                @if (option.avatarUrl) {
                  <img [src]="option.avatarUrl" alt="" />
                } @else {
                  {{ option.username.charAt(0).toUpperCase() }}
                }
              </span>
              <span class="picker-name">{{ option.username }}</span>
              @if (option.isFollowed) {
                <span class="picker-tag">Following</span>
              }
            </li>
          } @empty {
            <li class="picker-hint" role="presentation">{{ emptyHint() }}</li>
          }
        </ul>
      }

      @if (error(); as message) {
        <p class="picker-error" [id]="errorId()" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styleUrl: './player-picker.scss',
})
export class PlayerPicker {
  private followService = inject(FollowService);
  private searchService = inject(SearchService);
  private authService = inject(AuthService);

  inputId = input.required<string>();
  placeholder = input('Search a friend or username');
  /** Usernames that can't be picked again (already added / already invited). */
  exclude = input<string[]>([]);
  /** 'inline' sits in a chip row; 'field' looks like a standalone sheet input. */
  appearance = input<'inline' | 'field'>('inline');

  picked = output<PlayerOption>();

  protected readonly query = signal('');
  protected readonly isOpen = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly error = signal<string | null>(null);

  private readonly friends = signal<PlayerOption[]>([]);
  private readonly searchResults = signal<PlayerOption[]>([]);
  protected readonly isSearching = signal(false);
  private readonly isResolving = signal(false);

  protected readonly listId = computed(() => `${this.inputId()}-list`);
  protected readonly errorId = computed(() => `${this.inputId()}-error`);

  private readonly term = computed(() => this.query().trim().replace(/^@/, '').toLowerCase());
  private readonly myUsername = computed(() => this.authService.currentUser()?.username?.toLowerCase() ?? '');
  private readonly blocked = computed(
    () => new Set([...this.exclude().map((name) => name.toLowerCase()), this.myUsername()]),
  );

  /** Friends first (matching the text), then other players from search — no duplicates, no self, no excluded. */
  protected readonly options = computed(() => {
    const term = this.term();
    const blocked = this.blocked();
    const friends = this.friends().filter(
      (f) => !blocked.has(f.username.toLowerCase()) && (!term || f.username.toLowerCase().includes(term)),
    );
    const friendIds = new Set(friends.map((f) => f.userId));
    const others = term
      ? this.searchResults().filter((p) => !friendIds.has(p.userId) && !blocked.has(p.username.toLowerCase()))
      : [];
    return [...friends, ...others].slice(0, MAX_OPTIONS);
  });

  protected readonly listLabel = computed(() => (this.term() ? 'Matching players' : 'People you follow'));

  protected readonly emptyHint = computed(() => {
    if (!this.term()) {
      return this.friends().length ? 'Everyone you follow is already added.' : 'Type a username to find a player.';
    }
    if (this.term().length < SEARCH_MIN_CHARS) {
      return 'Type one more letter to search all players.';
    }
    if (this.isSearching()) {
      return 'Searching…';
    }
    return `No player named “${this.query().trim()}”.`;
  });

  protected readonly activeOptionId = computed(() =>
    this.isOpen() && this.activeIndex() >= 0 && this.activeIndex() < this.options().length
      ? this.optionId(this.activeIndex())
      : null,
  );

  constructor() {
    this.followService
      .getFollowedUsers()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (users) =>
          this.friends.set(
            users
              .map((u) => ({ userId: u.userId, username: u.username, avatarUrl: u.avatarUrl, isFollowed: true }))
              .sort((a, b) => a.username.localeCompare(b.username)),
          ),
        error: () => void 0,
      });

    toObservable(this.term)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap((term) => this.isSearching.set(term.length >= SEARCH_MIN_CHARS)),
        switchMap((term) => (term.length >= SEARCH_MIN_CHARS ? this.searchPlayers(term) : of([]))),
        takeUntilDestroyed(),
      )
      .subscribe((players) => {
        this.searchResults.set(players);
        this.isSearching.set(false);
      });
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.error.set(null);
    this.isOpen.set(true);
    this.activeIndex.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.isOpen.set(true);
        if (count) this.activeIndex.set((this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.isOpen.set(true);
        if (count) this.activeIndex.set(this.activeIndex() <= 0 ? count - 1 : this.activeIndex() - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const active = this.isOpen() ? this.options()[this.activeIndex()] : undefined;
        if (active) {
          this.pick(active);
        } else {
          this.resolveTyped();
        }
        break;
      }
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          event.stopPropagation(); // close the list, not the whole sheet
          this.isOpen.set(false);
        }
        break;
    }
  }

  protected pick(option: PlayerOption): void {
    this.picked.emit(option);
    this.query.set('');
    this.searchResults.set([]);
    this.activeIndex.set(-1);
    this.error.set(null);
  }

  /** Enter without a highlighted row: accept the typed name only if it's a real account. */
  private resolveTyped(): void {
    const term = this.term();
    if (!term || this.isResolving()) {
      return;
    }
    if (term === this.myUsername()) {
      this.error.set("That's you — invite someone else.");
      return;
    }
    if (this.blocked().has(term)) {
      this.error.set(`${this.query().trim()} is already on the list.`);
      return;
    }
    const known = [...this.friends(), ...this.searchResults()].find((p) => p.username.toLowerCase() === term);
    if (known) {
      this.pick(known);
      return;
    }
    this.isResolving.set(true);
    this.searchPlayers(term).subscribe((players) => {
      this.isResolving.set(false);
      const match = players.find((p) => p.username.toLowerCase() === term);
      if (match) {
        this.pick(match);
      } else {
        this.error.set(`No player named “${this.query().trim()}”. Pick one from the list.`);
      }
    });
  }

  private searchPlayers(term: string): Observable<PlayerOption[]> {
    const followed = new Set(this.friends().map((f) => f.userId));
    return this.searchService.search(term, SEARCH_LIMIT).pipe(
      map((result) =>
        result.players.map((p) => ({
          userId: p.userId,
          username: p.username,
          avatarUrl: p.avatarUrl,
          isFollowed: followed.has(p.userId),
        })),
      ),
      catchError(() => of([])),
    );
  }
}
