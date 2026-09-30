import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SearchResultModel } from '../../models/search.model';

/** Header "⌕ Search players, games, clips" — `GET /api/search?q=&limit=`. */
@Service()
export class SearchService {
  private http = inject(HttpClient);

  search(q: string, limit = 5): Observable<SearchResultModel> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<SearchResultModel>('/api/search', { params });
  }
}
