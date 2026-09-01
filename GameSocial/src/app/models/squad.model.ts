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
 * Corresponds to Domain.Responses.SquadResponse — used both for `squads/mine`
 * list items and the `squads/{id}` detail response (identical shape both
 * places). Does NOT embed members or messages; fetch those separately.
 */
export interface SquadModel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  primaryGameId?: number;
  primaryGameName?: string;
  createdByUserId: string;
  createdAt: string;
  memberCount: number;
  /** null/undefined if the current user is not a member of this squad. */
  currentUserRole?: SquadRoleName;
  channels: SquadChannelModel[];
}

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

/** Corresponds to Domain.Responses.SquadLeaderboardEntryResponse. */
export interface SquadLeaderboardEntryModel {
  userId: string;
  username: string;
  role: SquadRoleName;
  xp: number;
  level: number;
}

/** Corresponds to Domain.Requests.CreateSquadRequest. */
export interface CreateSquadRequest {
  name: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  primaryGameId?: number;
  additionalChannelNames?: string[];
}
