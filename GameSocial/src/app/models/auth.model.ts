/**
 * Corresponds to Domain.Responses.AccessTokenResponse.
 */
export interface AccessTokenResponse {
  accessToken: string;
  expiresAt: string;
  permissions: string[];
}

/**
 * Shape persisted in localStorage. Deliberately minimal — everything else
 * about the user (username, isDeveloper, isPremium, permissions, ...) is
 * derived from decoding the JWT claims on demand.
 */
export interface AuthSession {
  accessToken: string;
  expiresAt: string;
}

/**
 * Claims embedded in the access token by Infrastructure.Identity.JwtProvider.
 * NOTE: isDeveloper/isPremium arrive as the literal strings "True"/"False"
 * (the result of a C# bool's .ToString()), not JSON booleans.
 */
export interface JwtClaims {
  sub: string;
  email: string;
  username: string;
  isDeveloper: string;
  isPremium: string;
  /** Present once per granted permission — a single string or an array. */
  permissions?: string | string[];
  jti: string;
  exp: number;
  iss?: string;
  aud?: string;
}
