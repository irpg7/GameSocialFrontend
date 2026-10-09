import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GameListQuery, GameModel } from '../../models/game.model';
import { PagedResult } from '../../models/paged-result.model';
import { toHttpParams } from '../../shared/http-params';

@Service()
export class GameService {
  private http = inject(HttpClient);
  private apiUrl = '/api/games';

  /** One page of the catalogue (GET /api/games). Pickers pass filters so the server does the narrowing. */
  list(query: GameListQuery = {}): Observable<PagedResult<GameModel>> {
    return this.http.get<PagedResult<GameModel>>(this.apiUrl, { params: toHttpParams(query) });
  }

  /** Backoffice — Game.Manage permission required server-side. */
  create(formData: FormData): Observable<GameModel> {
    return this.http.post<GameModel>(this.apiUrl, formData);
  }

  update(id: number, formData: FormData): Observable<GameModel> {
    return this.http.put<GameModel>(`${this.apiUrl}/${id}`, formData);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
