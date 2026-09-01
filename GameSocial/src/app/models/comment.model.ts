/**
 * Corresponds to Domain.Responses.CommentResponse.
 */
export interface CommentModel {
  id: string;
  postId: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}
