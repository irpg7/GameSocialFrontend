/** Corresponds to Domain.Responses.ReviewWaitingGameResponse (GET /api/reviews/waiting). */
export interface ReviewWaitingGameModel {
  gameId: number;
  gameName: string;
  coverImageUrl: string;
}

/** Corresponds to Domain.Responses.TrustedReviewerResponse (GET /api/reviews/trusted-reviewers). */
export interface TrustedReviewerModel {
  userId: string;
  username: string;
  level: number;
  totalUsefulVotesReceived: number;
  isFollowedByCurrentUser: boolean;
}
