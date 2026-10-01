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

/**
 * Corresponds to Domain.Enums.VideoProcessingStatus as serialized by the backend.
 * Only meaningful for mediaType === 'Video' — a background job re-encodes uploaded
 * videos down to 720p; while Pending, `url` still points at the original file.
 */
export type VideoProcessingStatusName = 'Pending' | 'Completed' | 'Failed';

/** Domain.Enums.PostMediaRole — devlog media band: main "IN ENGINE" clip + before/after frames. */
export type PostMediaRoleName = 'InEngine' | 'Before' | 'After';

/** One transcoded quality (Clip Player ⚙ menu: 1080p60 / 1080p / 720p60 / 480p). */
export interface PostMediaRenditionModel {
  label: string;
  height: number;
  url: string;
}

export interface PostMediaModel {
  id: string;
  mediaType: PostMediaTypeName;
  url: string;
  durationSeconds?: number;
  photoType?: PostPhotoTypeName;
  processingStatus?: VideoProcessingStatusName;
  sortOrder: number;
  width?: number;
  height?: number;
  /** Poster frame for videos (queue thumbnails, hover preview). */
  thumbnailUrl?: string;
  role?: PostMediaRoleName;
  /** Empty when only `url` is playable. Ordered best-first. */
  renditions: PostMediaRenditionModel[];
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
  /** "DEVLOG #14" — per-game running number assigned server-side. */
  sequence: number;
  /** "Join the test branch" target. */
  testBranchUrl?: string;
  patchLines: PostDevlogPatchLineModel[];
}

/** Corresponds to Domain.Responses.PostReviewDetailsResponse. */
export interface PostReviewModel {
  /** One decimal, 0-10 (e.g. 8.4). */
  score: number;
  playStatus: PlayStatusName;
  hoursPlayed: number;
  spoilerFree: boolean;
  /** The full review write-up — added server-side after the Phase 2 fix; the headline lives on PostModel.caption. */
  body: string;
  /** "▶ Embed clip" — the author's own clip posts embedded in the review. */
  embeddedClipPostIds: string[];
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
  /** "LV 41" chip — derived server-side from the author's XP. */
  authorLevel: number;
  authorAvatarUrl?: string;
  /** "◆ DEVELOPER" badge. */
  authorIsDeveloper: boolean;
  authorStudioName?: string;
  /** "12.4k followers" + Follow button on the clip player author card. */
  authorFollowerCount: number;
  isAuthorFollowedByCurrentUser: boolean;
  postType: PostTypeName;
  gameId?: number;
  gameName?: string;
  gameCoverImageUrl?: string;
  /** Set when the post was tagged "also post to squad" at creation (Clip/Screenshots only). */
  squadId?: string;
  caption?: string;
  /** Only ever true on the author's own GET /api/posts/drafts results. */
  isDraft: boolean;
  /** Tag chips ("#driftchain", "Photo mode", "No spoilers"). */
  tags: string[];
  createdAt: string;
  /** Set when the author edited the post after publishing ("· edited"). */
  editedAt?: string;
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
  /** Unique viewers ("42.1k views"). */
  viewCount: number;
  /** "◇ Save" / "◆ Saved" / watch later. */
  isSavedByCurrentUser: boolean;
}
