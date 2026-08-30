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
  isPremium: boolean;
  createdAt: string;
  permissions: string[];
}
