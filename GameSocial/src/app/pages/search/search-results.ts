import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { SearchService } from '../../services/search/search.service';
import { SearchResultModel } from '../../models/search.model';
import { PostCard } from '../feed/post-card/post-card';

const LIMIT = 20;

/** `/search?q=` — the header search's "See all results": players, games and clips. */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink, PostCard],
  template: `
    <div class="search-page">
      <div class="page-head">
        <div>
          <h1>Search</h1>
          <p class="page-sub">{{ query() ? 'Results for “' + query() + '”' : 'Type in the header search to find players, games and clips.' }}</p>
        </div>
      </div>

      @if (isLoading()) {
        <p class="status">Searching...</p>
      } @else if (result(); as r) {
        @if (r.players.length + r.games.length + r.clips.length === 0) {
          <p class="status empty">No matches.</p>
        }
        @if (r.players.length > 0) {
          <div class="section-head"><span class="section-head-label">Players</span><span class="section-head-rule"></span></div>
          <ul class="grid">
            @for (p of r.players; track p.userId) {
              <li>
                <a class="tile" [routerLink]="['/profile', p.userId]">
                  <span class="tile-img">@if (p.avatarUrl) { <img [src]="p.avatarUrl" alt="" /> }</span>
                  <span class="tile-name">{{ p.username }}</span>
                  <span class="lv">LV {{ p.level }}</span>
                  @if (p.isDeveloper) { <span class="dev">DEV</span> }
                </a>
              </li>
            }
          </ul>
        }
        @if (r.games.length > 0) {
          <div class="section-head"><span class="section-head-label">Games</span><span class="section-head-rule"></span></div>
          <ul class="grid">
            @for (g of r.games; track g.id) {
              <li>
                <a class="tile" routerLink="/feed" [queryParams]="{ game: g.id }">
                  <span class="tile-img">@if (g.coverImageUrl) { <img [src]="g.coverImageUrl" alt="" /> }</span>
                  <span class="tile-name">{{ g.name }}</span>
                </a>
              </li>
            }
          </ul>
        }
        @if (r.clips.length > 0) {
          <div class="section-head"><span class="section-head-label">Clips</span><span class="section-head-rule"></span></div>
          @for (clip of r.clips; track clip.id) {
            <app-post-card [post]="clip" />
          }
        }
      }
    </div>
  `,
  styleUrl: './search-results.scss',
})
export class SearchResults {
  private searchService = inject(SearchService);

  protected readonly query = signal('');
  protected readonly result = signal<SearchResultModel | null>(null);
  protected readonly isLoading = signal(false);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(
        tap((params) => {
          this.query.set((params.get('q') ?? '').trim());
          this.isLoading.set(!!this.query());
        }),
        switchMap(() => (this.query() ? this.searchService.search(this.query(), LIMIT).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.result.set(result);
        this.isLoading.set(false);
      });
  }
}
