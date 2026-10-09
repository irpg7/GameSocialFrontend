import { HttpErrorResponse } from '@angular/common/http';

/**
 * Corresponds to Domain.Responses.AccessTokenResponse.
 */
export interface AccessTokenResponse {
  accessToken: string;
  expiresAt: string;
  permissions: string[];
  /** Opaque, single-use: `POST /api/auth/refresh` rotates it. */
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  /** Login only: the account was scheduled for deletion and this sign-in cancelled it. */
  deletionCancelled?: boolean;
}

/** Domain.Responses.AccountDeletionResponse — when the account will be permanently deleted. */
export interface AccountDeletionResponse {
  scheduledFor: string;
}

/**
 * Shape persisted in localStorage. Deliberately minimal — everything else
 * about the user (username, isDeveloper, isPremium, permissions, ...) is
 * derived from decoding the JWT claims on demand.
 */
export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
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

/** Domain.Responses.VerifyEmailResponse — `purpose` tells a sign-up confirmation from an email change. */
export interface VerifyEmailResponse {
  email: string;
  purpose: 'EmailVerification' | 'EmailChange';
}

/** `code` of the 403 login returns for an account whose email isn't verified yet. */
export const EMAIL_NOT_VERIFIED = 'EmailNotVerified';

/** `code` of the 403 login/refresh return for a site-wide banned account (the message carries the end date). */
export const ACCOUNT_BANNED = 'AccountBanned';

/** The server refused to renew the session for good: a dead refresh token, or a banned account. */
export function isSessionRejected(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 401 || error.status === 400 || (error.status === 403 && error.error?.code === ACCOUNT_BANNED))
  );
}
