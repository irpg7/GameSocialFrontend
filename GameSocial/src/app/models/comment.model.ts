/**
 * Corresponds to Domain.Responses.CommentResponse.
 */
export interface CommentModel {
  id: string;
  postId: string;
  userId: string;
  username: string;
  /** "LV 17" chip next to the author. */
  authorLevel: number;
  authorAvatarUrl?: string;
  /** "◆ YAPIMCI" badge. */
  authorIsDeveloper: boolean;
  body: string;
  createdAt: string;
  /** Clip comments: the "@0:12" stamp in seconds — clicking seeks the player. */
  timestampSeconds?: number;
  /** Set on replies ("↩ Yanıtla"); replies are one level deep. */
  parentCommentId?: string;
  /** The game developer's reply — "◆ YAPIMCI YANITI · en üstte sabit". Always listed first. */
  isPinned: boolean;
  voteCount: number;
  isVotedByCurrentUser: boolean;
  replyCount: number;
}

/** GET /api/posts/{postId}/comments `sort` values. */
export type CommentSort = 'oldest' | 'new' | 'top';

/** Corresponds to Domain.Responses.CommentVoteResponse. */
export interface CommentVoteModel {
  voted: boolean;
  voteCount: number;
}
