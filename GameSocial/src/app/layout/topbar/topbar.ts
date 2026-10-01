import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { MeService } from '../../services/me/me.service';
import { SearchService } from '../../services/search/search.service';
import { PresenceStatusName } from '../../models/me.model';
import { SearchResultModel } from '../../models/search.model';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

const HEARTBEAT_MS = 60_000;

/** The account menu's status row cycles through these, in the design's order. */
const STATUSES: { value: PresenceStatusName; label: string; dot: string }[] = [
  { value: 'Online', label: 'Çevrimiçi', dot: 'online' },
  { value: 'Invisible', label: 'Oyunda görünme', dot: 'away' },
  { value: 'DoNotDisturb', label: 'Rahatsız etme', dot: 'dnd' },
];

interface MenuItem {
  icon: string;
  label: string;
  hint: string;
  link: string[];
}

@Component({
  selector: 'app-topbar',
  imports: [ImgFallback, RouterLink, RouterLinkActive],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeAll()',
  },
})
export class Topbar {
  protected readonly authService = inject(AuthService);
  protected readonly meService = inject(MeService);
  private searchService = inject(SearchService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);

  protected readonly isMenuOpen = signal(false);

  protected readonly query = signal('');
  protected readonly results = signal<SearchResultModel | null>(null);
  protected readonly isSearchOpen = signal(false);
  private readonly query$ = new Subject<string>();

  protected readonly hasResults = computed(() => {
    const r = this.results();
    return !!r && r.players.length + r.games.length + r.clips.length > 0;
  });

  protected readonly status = computed(() => {
    const current = this.meService.me()?.presenceStatus ?? 'Online';
    return STATUSES.find((s) => s.value === current) ?? STATUSES[0];
  });

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const me = this.meService.me();
    const count = (n: number | undefined) => (n ? String(n) : '');
    return [
      { icon: '▶', label: 'Klipslerim', hint: count(me?.clipCount), link: ['/me/clips'] },
      { icon: '◇', label: 'Kaydedilenler', hint: count(me?.savedCount), link: ['/saved'] },
      { icon: '★', label: 'İncelemelerim', hint: count(me?.reviewCount), link: ['/me/reviews'] },
      { icon: '◫', label: 'Taslaklar', hint: count(me?.draftCount), link: ['/drafts'] },
      { icon: '⚙', label: 'Ayarlar', hint: '', link: me ? ['/profile', me.id] : ['/feed'] },
    ];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Presence: "online" means a heartbeat within the last 2 minutes.
    const beat = () => this.meService.heartbeat().subscribe({ error: () => void 0 });
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    destroyRef.onDestroy(() => clearInterval(timer));

    this.query$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => (q.trim() ? this.searchService.search(q.trim()).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((result) => this.results.set(result));
  }

  toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
    this.isSearchOpen.set(false);
  }

  closeAll(): void {
    this.isMenuOpen.set(false);
    this.isSearchOpen.set(false);
  }

  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeAll();
    }
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.isSearchOpen.set(true);
    this.query$.next(value);
  }

  /** Enter opens the full results page. */
  submitSearch(): void {
    const q = this.query().trim();
    if (!q) {
      return;
    }
    this.isSearchOpen.set(false);
    void this.router.navigate(['/search'], { queryParams: { q } });
  }

  pickResult(): void {
    this.isSearchOpen.set(false);
    this.query.set('');
    this.results.set(null);
  }

  cycleStatus(): void {
    const index = STATUSES.findIndex((s) => s.value === this.status().value);
    const next = STATUSES[(index + 1) % STATUSES.length];
    this.meService.setStatus(next.value).subscribe({ error: () => void 0 });
  }

  logout(): void {
    this.authService.logout();
    this.isMenuOpen.set(false);
    void this.router.navigate(['/login']);
  }
}
