import { GameModel } from './game.model';
import { PostModel } from './post.model';
import { JoinPolicyName } from './squad.model';

/** Domain.Enums.SearchType — `All` returns a few of each group; the others return one group, paged. */
export type SearchType = 'All' | 'Players' | 'Games' | 'Squads' | 'Posts' | 'Clips' | 'Reviews';

/** Domain.Responses.SearchPlayerResponse. */
export interface SearchPlayerModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  isDeveloper: boolean;
  xp: number;
  level: number;
}

/** Domain.Responses.SearchSquadResponse. */
export interface SearchSquadModel {
  id: string;
  name: string;
  iconUrl?: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  memberCount: number;
  maxMembers: number;
  primaryGameName?: string;
  isMember: boolean;
}

/**
 * Domain.Responses.SearchResponse — GET /api/search?q=&type=. With `type=All` every group holds up to
 * `limit` results; otherwise only the requested group is filled and `page` / `hasMore` apply.
 * `posts` = devlogs, screenshots and polls (clips and reviews have their own groups).
 */
export interface SearchResultModel {
  type: SearchType;
  players: SearchPlayerModel[];
  games: GameModel[];
  squads: SearchSquadModel[];
  clips: PostModel[];
  reviews: PostModel[];
  posts: PostModel[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
