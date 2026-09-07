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
}
