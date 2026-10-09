export type GameGenreName =
  | 'Action'
  | 'Adventure'
  | 'RPG'
  | 'Strategy'
  | 'Simulation'
  | 'Sports'
  | 'Racing'
  | 'Puzzle'
  | 'Shooter'
  | 'Horror'
  | 'Indie'
  | 'Other';

/** Single source of truth for the Domain.Enums.GameGenre values — used by both the onboarding flow and the games-admin form. */
export const GAME_GENRES: { value: GameGenreName; label: string }[] = [
  { value: 'Action', label: 'Action' },
  { value: 'Adventure', label: 'Adventure' },
  { value: 'RPG', label: 'RPG' },
  { value: 'Strategy', label: 'Strategy' },
  { value: 'Simulation', label: 'Simulation' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Racing', label: 'Racing' },
  { value: 'Puzzle', label: 'Puzzle' },
  { value: 'Shooter', label: 'Shooter' },
  { value: 'Horror', label: 'Horror' },
  { value: 'Indie', label: 'Indie' },
  { value: 'Other', label: 'Other' },
];

export interface GameModel {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string;
  /** A game can belong to more than one genre (e.g. Action + RPG). */
  genres: GameGenreName[];
  /** "Kuytu Studio · souls-like, co-op" on the Reviews game summary. */
  studio?: string;
  /** "2023-08-03" — caps "hours played" on reviews to the time since release. */
  releaseDate?: string;
  /** The game's developer account — their comments pin as "◆ YAPIMCI YANITI". */
  developerUserId?: string;
  developerUsername?: string;
  /** Whether the signed-in user follows this game (GET /api/games fills it). */
  isFollowed?: boolean;
}

/** Query for GET /api/games (Application.Features.Games.List.ListGamesQuery) — paged, max 100 per page. */
export interface GameListQuery {
  search?: string;
  genres?: GameGenreName[];
  ids?: number[];
  /** Only games this account is the verified developer of (devlog picker). */
  ownedByMe?: boolean;
  /** Leave out games you already reviewed (one review per game). */
  notReviewedByMe?: boolean;
  /** Games you follow first (pickers). */
  followedFirst?: boolean;
  page?: number;
  pageSize?: number;
}
