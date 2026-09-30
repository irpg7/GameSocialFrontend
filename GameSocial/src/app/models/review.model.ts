import { GameGenreName } from './game.model';
import { PlayStatusName } from './post.model';

/** Corresponds to Domain.Responses.ReviewWaitingGameResponse (GET /api/reviews/waiting). */
export interface ReviewWaitingGameModel {
  gameId: number;
  gameName: string;
  coverImageUrl: string;
  /** From the latest review draft for the game, if any (no tracked playtime exists). */
  hoursPlayed?: number;
  playStatus?: PlayStatusName;
  /** First/last of your own posts on the game. */
  firstActivityAt: string;
  lastActivityAt: string;
  /** A resumable review draft. */
  draftPostId?: string;
}

/** Corresponds to Domain.Responses.TrustedReviewerResponse (GET /api/reviews/trusted-reviewers). */
export interface TrustedReviewerModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  level: number;
  totalUsefulVotesReceived: number;
  /** "86 reviews · 94% useful". */
  reviewCount: number;
  usefulPercent: number;
  isFollowedByCurrentUser: boolean;
}

/** One histogram row of the game summary ("9-10", "7-8", "5-6", "1-4"). */
export interface ReviewScoreBucketModel {
  label: string;
  count: number;
  percent: number;
}

/** "Combat praised in 71%" — a tag and the share of reviews carrying it. */
export interface ReviewThemeModel {
  tag: string;
  percent: number;
}

/** "Dev replied · DevLog #14". */
export interface ReviewDevReplyModel {
  postId: string;
  sequence: number;
  title?: string;
}

/** Corresponds to Domain.Responses.ReviewSummaryResponse (GET /api/reviews/summary). */
export interface ReviewSummaryModel {
  gameId: number;
  gameName: string;
  coverImageUrl: string;
  studio?: string;
  genres: GameGenreName[];
  averageScore: number;
  reviewCount: number;
  histogram: ReviewScoreBucketModel[];
  themes: ReviewThemeModel[];
  latestDevlog?: ReviewDevReplyModel;
}
