/** Corresponds to Domain.Enums.JoinPolicy as serialized by the backend. */
export type JoinPolicyName = 'InviteOnly' | 'AskToJoin' | 'Open' | 'Hidden';

/** Corresponds to Domain.Enums.SquadRole as serialized by the backend. */
/** Captain = Kurucu (single, fixed), Admin = Yönetici, Member = Üye. */
export type SquadRoleName = 'Captain' | 'Member' | 'Admin';

/** Corresponds to Domain.Responses.SquadChannelResponse. */
export interface SquadChannelModel {
  id: string;
  name: string;
  sortOrder: number;
  /** Messages by others since you last read this channel. */
  unreadCount: number;
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
  /** Squad level, derived server-side from xp ("SQUAD LEVEL 6 · 4,820 / 6,000"). */
  xp: number;
  level: number;
  xpForNextLevel: number;
  iconUrl?: string;
  bannerUrl?: string;
  maxMembers: number;
  openSlots: number;
  /** Active members with a heartbeat in the last 2 minutes. */
  onlineCount: number;
  /** sqSettings "İçerik kuralları". */
  allowMemberUploads: boolean;
  requireSpoilerTag: boolean;
  requireMemberApproval: boolean;
  weeklyDigest: boolean;
  /** Sidebar badges: "12 mesaj", "3 yeni klip". */
  unreadMessageCount: number;
  newClipCount: number;
}

/** Mirrors Application.Features.Squads.Shared.SquadGameSetResolver.MaxGames. */
export const MAX_SQUAD_GAMES = 5;

/** Corresponds to Domain.Responses.SquadMemberResponse. */
export interface SquadMemberModel {
  userId: string;
  username: string;
  role: SquadRoleName;
  joinedAt: string;
  avatarUrl?: string;
  /** Pending = waiting for approval (content rule "Yeni üyeyi onaydan geçir"). */
  status?: SquadMemberStatusName;
  /** Server-resolved (Domain.Common.PresenceRules); the roster dot colour. */
  presence?: PresenceName;
  /** "Ashfall · Boss 7 · 2. deneme" — only set while online/away. */
  currentActivity?: string;
  /** "2 gün önce çıktı" — null for invisible users. */
  lastSeenAt?: string;
  xp?: number;
  level?: number;
}

export type SquadMemberStatusName = 'Active' | 'Pending';
export type PresenceName = 'online' | 'away' | 'dnd' | 'offline';

/** Corresponds to Domain.Responses.SharedPostPreviewResponse. */
export interface SharedPostPreviewModel {
  id: string;
  postType: string;
  caption?: string;
  gameName?: string;
  /** Video poster or photo — never the video file itself. */
  thumbnailUrl?: string;
  durationSeconds?: number;
  likeCount: number;
  commentCount: number;
}

export type SquadMessageKindName = 'Text' | 'SharedPost' | 'Event';

/** Corresponds to Domain.Responses.SquadReactionSummaryResponse — "▲ 4" / "🔥 2". */
export interface SquadReactionSummaryModel {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
}

/** Corresponds to Domain.Responses.SquadMessageResponse. */
export interface SquadMessageModel {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  /** Event = system row ("yaren_hp unlocked No Deaths, Act 1 — squad earned +300 XP"); body is the achievement name. */
  kind: SquadMessageKindName;
  body?: string;
  eventXp?: number;
  sharedPost?: SharedPostPreviewModel;
  isPinned: boolean;
  reactions: SquadReactionSummaryModel[];
  createdAt: string;
}

/** Corresponds to Domain.Responses.SquadGuideResponse — "◫ Pinned guides". */
export interface SquadGuideModel {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  gameId?: number;
  gameName?: string;
  createdByUserId: string;
  createdByUsername: string;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
  /** Photo count, not post count. */
  screenCount: number;
  items: SquadGuideItemModel[];
}

export interface SquadGuideItemModel {
  postId: string;
  postType: string;
  caption?: string;
  thumbnailUrl?: string;
  photoCount: number;
}

/** Corresponds to Domain.Requests.SquadGuideRequest. */
export interface SquadGuideRequest {
  title: string;
  description?: string;
  gameId?: number;
  postIds: string[];
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
  /** XP in the requested window (`?window=week` → last 7 days' ledger sum, otherwise all-time). */
  xp: number;
  /** Always all-time. */
  totalXp: number;
  level: number;
  avatarUrl?: string;
  earnedAchievementsCount: number;
}

/** Corresponds to Domain.Requests.SquadRequest + CreateSquadCommand. */
export interface CreateSquadRequest {
  name: string;
  description?: string;
  joinPolicy: JoinPolicyName;
  /** Must be one of `gameIds` when both are sent. */
  primaryGameId?: number;
  gameIds?: number[];
  /** Legacy: appended after the default #genel + #clips when `channelNames` is absent. */
  additionalChannelNames?: string[];
  /** Starter channels in order ("Başlangıç kanalları"); empty/absent = #genel + #clips. */
  channelNames?: string[];
  /** "Invite 2 friends now…" — pending SquadInvites created with the squad. */
  inviteUsernames?: string[];
  allowMemberUploads?: boolean;
  requireSpoilerTag?: boolean;
  requireMemberApproval?: boolean;
  weeklyDigest?: boolean;
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
  /** sqSettings "İçerik kuralları" — omitted = unchanged. */
  allowMemberUploads?: boolean;
  requireSpoilerTag?: boolean;
  requireMemberApproval?: boolean;
  weeklyDigest?: boolean;
}

/** Corresponds to Domain.Responses.SquadLatestActivityResponse — sidebar card activity line. */
export interface SquadLatestActivityModel {
  squadId: string;
  userId: string;
  username: string;
  kind: SquadMessageKindName;
  body?: string;
  postType?: string;
  caption?: string;
  /** Same author's posts of this type in the last hour ("3 klip paylaştı"). */
  sharedCount: number;
  createdAt: string;
}

/** Corresponds to Domain.Responses.SquadLibraryResponse — the room's tab counts. */
export interface SquadLibraryModel {
  clipCount: number;
  /** Photos across the squad's screenshot posts (not post count). */
  screenCount: number;
  guideCount: number;
  /** gameId → photo count, for the mosaic's "+N" under a game filter. */
  screenCountByGame: Record<string, number>;
}
