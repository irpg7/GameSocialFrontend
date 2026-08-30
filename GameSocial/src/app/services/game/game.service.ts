import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GameModel } from '../../models/game.model';

@Service()
export class GameService {
  private http = inject(HttpClient);
  private apiUrl = '/api/games';

  getGames(): Observable<GameModel[]> {
    return this.http.get<GameModel[]>(this.apiUrl);
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
