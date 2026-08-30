/**
 * Corresponds to Domain.Responses.CommentResponse.
 */
export interface CommentModel {
  id: number;
  postId: number;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}
