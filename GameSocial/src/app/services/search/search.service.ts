import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SearchResultModel, SearchType } from '../../models/search.model';
import { toHttpParams } from '../../shared/http-params';

/**
 * GET /api/search. `search(q, limit)` is the header box ("All": a few players, games, squads, clips,
 * reviews and posts); `searchType(q, type, page)` pages through one group for the /search tabs.
 */
@Service()
export class SearchService {
  private http = inject(HttpClient);

  search(q: string, limit = 5): Observable<SearchResultModel> {
    return this.http.get<SearchResultModel>('/api/search', { params: toHttpParams({ q, limit, type: 'All' }) });
  }

  searchType(q: string, type: Exclude<SearchType, 'All'>, page = 1, pageSize = 20): Observable<SearchResultModel> {
    return this.http.get<SearchResultModel>('/api/search', { params: toHttpParams({ q, type, page, pageSize }) });
  }
}
