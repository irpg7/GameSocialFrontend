import { GameModel } from './game.model';
import { PostModel } from './post.model';

/** Domain.Responses.SearchPlayerResponse. */
export interface SearchPlayerModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  isDeveloper: boolean;
  xp: number;
  level: number;
}

/** Domain.Responses.SearchResponse — GET /api/search?q=. */
export interface SearchResultModel {
  players: SearchPlayerModel[];
  games: GameModel[];
  clips: PostModel[];
}
