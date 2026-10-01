/** Corresponds to Domain.Responses.SquadBanResponse — one row of a squad's blacklist. */
export interface SquadBanModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  bannedAt: string;
}
