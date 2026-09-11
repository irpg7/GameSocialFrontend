/** Corresponds to Domain.Enums.JoinPolicy as serialized by the backend. */
export type JoinPolicyName = 'InviteOnly' | 'AskToJoin' | 'Open';

/** Corresponds to Domain.Enums.SquadRole as serialized by the backend. */
export type SquadRoleName = 'Captain' | 'Member';

/** Corresponds to Domain.Responses.SquadChannelResponse. */
export interface SquadChannelModel {
  id: string;
  name: string;
  sortOrder: number;
}

/**
 * Corresponds to Domain.Responses.SquadGameResponse — a trimmed game preview
 * (no slug/genres), enough for the settings chips and the banner cover.
 */
export interface SquadGameModel {
  id: number;
  name: string;
  /** Backend column is non-nullable and defaults to '' — treat '' as "no cover", not just null. */
  coverImageUrl: string;
}

/**
 * Corresponds to Domain.Responses.SquadResponse — used by `squads/mine`,
 * `squads/{id}` and `PUT squads/{id}` (identical shape in all three; produced
 * server-side by SquadResponseProjector). Does NOT embed members or messages;
 * fetch those separately.
 */
export interface SquadModel {
  id: string;
  name: string;
  /** Generated once at create and intentionally immutable — a rename does NOT change it. */
  slug: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  /**
   * The banner game — the captain's explicit pick out of `games`. Not
   * necessarily `games[0]`, so key the banner off `primaryGameCoverImageUrl`.
   */
  primaryGameId?: number;
  primaryGameName?: string;
  /** May be '' as well as null/undefined when there is no cover. */
  primaryGameCoverImageUrl?: string;
  /** The squad's games in `sortOrder` order, at most MAX_SQUAD_GAMES. */
  games: SquadGameModel[];
  createdByUserId: string;
  createdAt: string;
  memberCount: number;
  /** Drives the "Pinned" tab count without fetching the list. */
  pinnedMessageCount: number;
  /** null/undefined if the current user is not a member of this squad. */
  currentUserRole?: SquadRoleName;
  channels: SquadChannelModel[];
}

/** Mirrors Application.Features.Squads.Shared.SquadGameSetResolver.MaxGames. */
export const MAX_SQUAD_GAMES = 5;

/** Corresponds to Domain.Responses.SquadMemberResponse. */
export interface SquadMemberModel {
  userId: string;
  username: string;
  role: SquadRoleName;
  joinedAt: string;
}

/** Corresponds to Domain.Responses.SharedPostPreviewResponse. */
export interface SharedPostPreviewModel {
  id: string;
  postType: string;
  caption?: string;
  gameName?: string;
  thumbnailUrl?: string;
}

/** Corresponds to Domain.Responses.SquadMessageResponse. */
export interface SquadMessageModel {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  body?: string;
  sharedPost?: SharedPostPreviewModel;
  isPinned: boolean;
  createdAt: string;
}

/**
 * Corresponds to Domain.Responses.PinnedSquadMessageResponse — `GET squads/{id}/pins`
 * spans every channel, so each row carries its channel's name.
 */
export interface PinnedSquadMessageModel extends SquadMessageModel {
  channelName: string;
}

/** Corresponds to Domain.Responses.SquadLeaderboardEntryResponse. */
export interface SquadLeaderboardEntryModel {
  userId: string;
  username: string;
  role: SquadRoleName;
  xp: number;
  level: number;
}

/** Corresponds to Domain.Requests.SquadRequest + CreateSquadCommand. */
export interface CreateSquadRequest {
  name: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  /** Must be one of `gameIds` when both are sent. */
  primaryGameId?: number;
  gameIds?: number[];
  additionalChannelNames?: string[];
}

/**
 * Corresponds to Domain.Requests.SquadRequest for `PUT squads/{id}`.
 * PUT semantics: this is the *complete* representation, so omitting a field
 * clears it (omit `description` and the description is wiped).
 */
export interface UpdateSquadRequest {
  name: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  primaryGameId?: number;
  gameIds?: number[];
}
