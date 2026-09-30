/**
 * Corresponds to Domain.Responses.HotMomentResponse (`GET /api/posts/{id}/hot-moments`).
 * Derived server-side by clustering timestamped comments — the #FFB020 seek-bar
 * markers and the Clip Player "Hot moments" chip row.
 */
export interface HotMomentModel {
  atSeconds: number;
  /** The top comment of the cluster, trimmed. */
  label: string;
  commentCount: number;
  voteCount: number;
}
