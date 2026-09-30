/** Domain.Responses.SquadActivityResponse — GET /api/feed/squad-activity. */
export interface SquadActivityModel {
  /** "unlocked <achievement>", "started <game>", "posted a clip". */
  kind: 'achievement' | 'started' | 'clip';
  userId: string;
  username: string;
  avatarUrl?: string;
  squadId: string;
  squadName: string;
  squadIconUrl?: string;
  /** The highlighted part: achievement name, game name or clip title. */
  subject: string;
  gameId?: number;
  postId?: string;
  createdAt: string;
}
