/**
 * Corresponds to Domain.Responses.UserResponse — the backoffice Users screen's
 * view of a user (full profile + granted permissions). Deliberately separate
 * from UserModel: AuthService.currentUser() is derived from JWT claims alone
 * and can't reliably populate createdAt/permissions the way this admin
 * listing endpoint does.
 */
export interface AdminUserModel {
  id: string;
  username: string;
  email: string;
  isDeveloper: boolean;
  /** Asked for a developer account at sign-up; waiting for an admin. */
  developerRequested: boolean;
  isPremium: boolean;
  createdAt: string;
  permissions: string[];
  /** Site-wide ban currently in force (`banEndsAt` null = permanent). */
  isBanned: boolean;
  banEndsAt?: string | null;
  banReason?: string | null;
}

/** Query for GET /api/users (backoffice, paged, max 100 per page). */
export interface AdminUserListQuery {
  /** Matches username or email. */
  search?: string;
  developerRequestsOnly?: boolean;
  /** Only accounts with a ban in force. */
  bannedOnly?: boolean;
  page?: number;
  pageSize?: number;
}
