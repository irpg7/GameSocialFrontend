import { Service, inject } from '@angular/core';
import { Observable, map, of, shareReplay } from 'rxjs';
import { GameModel } from '../../models/game.model';
import { GameService } from './game.service';

/**
 * Remembers games already seen (picker pages, search results) so a bare game id — a preselected picker
 * value, the feed's game filter — can be shown by name without downloading the whole catalogue.
 * Unknown ids are fetched once with GET /api/games?ids=.
 */
@Service()
export class GameLookup {
  private gameService = inject(GameService);
  private readonly known = new Map<number, GameModel>();
  private readonly pending = new Map<number, Observable<GameModel | null>>();

  remember(games: readonly GameModel[]): void {
    for (const game of games) {
      this.known.set(game.id, game);
    }
  }

  get(id: number): GameModel | undefined {
    return this.known.get(id);
  }

  resolve(id: number): Observable<GameModel | null> {
    const cached = this.known.get(id);
    if (cached) {
      return of(cached);
    }
    let request = this.pending.get(id);
    if (!request) {
      request = this.gameService.list({ ids: [id], pageSize: 1 }).pipe(
        map((page) => {
          this.remember(page.items);
          this.pending.delete(id);
          return page.items[0] ?? null;
        }),
        shareReplay(1),
      );
      this.pending.set(id, request);
    }
    return request;
  }
}
