import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, map, merge } from 'rxjs';
import { SearchService } from '../../services/search/search.service';
import { GameLookup } from '../../services/game/game-lookup.service';
import { SearchResultModel, SearchType } from '../../models/search.model';
import { PostCard } from '../feed/post-card/post-card';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { LoadError } from '../../shared/load-error/load-error';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { NotificationService } from '../../services/notification/notification.service';

/** Results per group on the "All" tab. */
const ALL_LIMIT = 6;
const PAGE_SIZE = 20;

type PagedType = Exclude<SearchType, 'All'>;

const TABS: { value: SearchType; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Players', label: 'Players' },
  { value: 'Games', label: 'Games' },
  { value: 'Squads', label: 'Squads' },
  { value: 'Clips', label: 'Clips' },
  { value: 'Reviews', label: 'Reviews' },
  { value: 'Posts', label: 'Posts' },
];

function emptyResult(type: SearchType): SearchResultModel {
  return { type, players: [], games: [], squads: [], clips: [], reviews: [], posts: [], page: 1, pageSize: 0, hasMore: false };
}

/**
 * `/search?q=&type=` — the header search's "See all results". "All" shows a few of each group with a
 * "See all" link; the other tabs page through one group ("Load more"). Matching and ranking happen on
 * the server (GET /api/search: typo-tolerant names, full-text posts).
 */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink, NgTemplateOutlet, PostCard, ImgFallback, LoadError],
  templateUrl: './search-results.html',
  styleUrl: './search-results.scss',
})
export class SearchResults {
  private searchService = inject(SearchService);
  private gameLookup = inject(GameLookup);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly query = signal('');
  protected readonly type = signal<SearchType>('All');
  protected readonly result = signal<SearchResultModel | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly isLoadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isEmpty = computed(() => {
    const r = this.result();
    return (
      !!r &&
      r.players.length + r.games.length + r.squads.length + r.clips.length + r.reviews.length + r.posts.length === 0
    );
  });

  private readonly retries = new Subject<void>();
  private request?: Subscription;

  constructor() {
    const params$ = inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => ({ query: (params.get('q') ?? '').trim(), type: toSearchType(params.get('type')) })),
    );
    merge(params$, this.retries.pipe(map(() => ({ query: this.query(), type: this.type() }))))
      .pipe(takeUntilDestroyed())
      .subscribe(({ query, type }) => {
        this.query.set(query);
        this.type.set(type);
        this.fetch(1);
      });
  }

  protected selectTab(type: SearchType): void {
    void this.router.navigate([], { queryParams: { type: type === 'All' ? null : type }, queryParamsHandling: 'merge' });
  }

  protected loadMore(): void {
    const r = this.result();
    if (r?.hasMore && !this.isLoadingMore()) {
      this.fetch(r.page + 1);
    }
  }

  protected retry(): void {
    this.retries.next();
  }

  private fetch(page: number): void {
    this.request?.unsubscribe();
    const query = this.query();
    const type = this.type();
    const first = page === 1;
    this.loadError.set(null);
    if (!query) {
      this.result.set(null);
      this.isLoading.set(false);
      return;
    }
    if (first) {
      this.result.set(null);
      this.isLoading.set(true);
    } else {
      this.isLoadingMore.set(true);
    }

    const request$ =
      type === 'All' ? this.searchService.search(query, ALL_LIMIT) : this.searchService.searchType(query, type as PagedType, page, PAGE_SIZE);
    this.request = request$.subscribe({
      next: (result) => {
        this.gameLookup.remember(result.games);
        this.result.update((current) => (first || !current ? result : appendPage(current, result)));
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
        const message = extractApiErrorMessage(err, 'Search failed. Please try again.');
        if (first) {
          this.loadError.set(message);
        } else {
          this.notificationService.error(message);
        }
      },
    });
  }
}

function toSearchType(value: string | null): SearchType {
  return TABS.find((tab) => tab.value.toLowerCase() === (value ?? '').toLowerCase())?.value ?? 'All';
}

function appendPage(current: SearchResultModel, next: SearchResultModel): SearchResultModel {
  const merged = emptyResult(next.type);
  return {
    ...merged,
    players: [...current.players, ...next.players],
    games: [...current.games, ...next.games],
    squads: [...current.squads, ...next.squads],
    clips: [...current.clips, ...next.clips],
    reviews: [...current.reviews, ...next.reviews],
    posts: [...current.posts, ...next.posts],
    page: next.page,
    pageSize: next.pageSize,
    hasMore: next.hasMore,
  };
}
