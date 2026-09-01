/**
 * Corresponds to Domain.Enums.PostType as serialized by the backend
 * (System.Text.Json serializes C# enums to their PascalCase member name).
 */
export type PostTypeName = 'Clip' | 'Devlog' | 'Screenshots' | 'Review' | 'Poll';

/**
 * Corresponds to Domain.Enums.PostMediaType as serialized by the backend.
 */
export type PostMediaTypeName = 'Video' | 'Photo';

/**
 * Corresponds to Domain.Enums.PostPhotoType as serialized by the backend.
 */
export type PostPhotoTypeName = 'Screenshot' | 'ConceptArt';

/**
 * Corresponds to Domain.Enums.PlayStatus as serialized by the backend.
 */
export type PlayStatusName = 'Finished' | 'StillPlaying' | 'Dropped';

/**
 * Corresponds to Domain.Enums.PatchLineStatus as serialized by the backend.
 */
export type PatchLineStatusName = 'Shipped' | 'Fixed' | 'Investigating';

export interface PostMediaModel {
  id: string;
  mediaType: PostMediaTypeName;
  url: string;
  durationSeconds?: number;
  photoType?: PostPhotoTypeName;
  sortOrder: number;
}

export interface PostDevlogPatchLineModel {
  id: string;
  text: string;
  status: PatchLineStatusName;
  sortOrder: number;
}

/** Corresponds to Domain.Responses.PostDevlogDetailsResponse. */
export interface PostDevlogModel {
  title: string;
  body: string;
  buildTag?: string;
  branchTag?: string;
  patchLines: PostDevlogPatchLineModel[];
}

/** Corresponds to Domain.Responses.PostReviewDetailsResponse. */
export interface PostReviewModel {
  score: number;
  playStatus: PlayStatusName;
  hoursPlayed: number;
  spoilerFree: boolean;
  /** The full review write-up — added server-side after the Phase 2 fix; the headline lives on PostModel.caption. */
  body: string;
}

/** Corresponds to Domain.Responses.PostPollOptionResponse. */
export interface PostPollOptionModel {
  id: string;
  text: string;
  sortOrder: number;
  /** null when results are hidden from the current viewer (see PostPollModel.hideResultsUntilVoted). */
  voteCount?: number;
}

/** Corresponds to Domain.Responses.PostPollResponse. */
export interface PostPollModel {
  expiresAt: string;
  hideResultsUntilVoted: boolean;
  isExpired: boolean;
  hasCurrentUserVoted: boolean;
  currentUserOptionId?: string;
  /** Always visible, even when the per-option breakdown is hidden. */
  totalVotes: number;
  options: PostPollOptionModel[];
}

/** Corresponds to Domain.Responses.PostResponse. */
export interface PostModel {
  id: string;
  userId: string;
  username: string;
  postType: PostTypeName;
  gameId?: number;
  gameName?: string;
  /** Set when the post was tagged "also post to squad" at creation (Clip/Screenshots only). */
  squadId?: string;
  caption?: string;
  createdAt: string;
  media: PostMediaModel[];
  /** Exactly one of devlog/review/poll is set, matching postType; Clip/Screenshots have none. */
  devlog?: PostDevlogModel;
  review?: PostReviewModel;
  poll?: PostPollModel;
  /**
   * For postType === 'Review' these represent "Useful" votes instead of
   * "Like" (same PostInteraction mechanism, different label/route) — see
   * LikeService.toggleUseful.
   */
  likeCount: number;
  isLikedByCurrentUser: boolean;
  commentCount: number;
}
