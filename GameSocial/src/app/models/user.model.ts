export interface UserModel {
  id: string;
  username: string;
  email: string;
  isDeveloper: boolean;
  isPremium: boolean;
  /** Not present in the JWT claims that back AuthService.currentUser(). */
  createdAt?: string;
}
