import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, Subject, finalize, firstValueFrom, map, shareReplay, tap, throwError } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { AccessTokenResponse, AuthSession, JwtClaims, VerifyEmailResponse, isSessionRejected } from '../../models/auth.model';
import { UserModel } from '../../models/user.model';

const STORAGE_KEY = 'gamesocial_auth';

/** Pages a signed-out visitor may sit on — an expired session never redirects away from these. */
const AUTH_PAGES = ['/login', '/register', '/check-inbox', '/verify-email', '/forgot-password', '/reset-password'];

/** Refresh this long before the access token expires, so in-flight requests never carry a stale token. */
const REFRESH_LEEWAY_MS = 60_000;

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function isFuture(isoDate: string | undefined, leewayMs = 0): boolean {
  return !!isoDate && new Date(isoDate).getTime() - leewayMs > Date.now();
}

function subjectOf(session: AuthSession | null): string | null {
  if (!session) {
    return null;
  }
  try {
    return jwtDecode<JwtClaims>(session.accessToken).sub;
  } catch {
    return null;
  }
}

@Service()
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private sessionState = signal<AuthSession | null>(loadSession());

  private refreshInFlight: Observable<string> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly sessionEndedSubject = new Subject<void>();
  /**
   * Fires when the session goes away (logout, expiry, logout in another tab) or another account
   * signs in. Per-user state (SignalR connection, `MeService`) resets itself on this.
   */
  readonly sessionEnded$ = this.sessionEndedSubject.asObservable();

  constructor() {
    this.scheduleRefresh();

    // Tabs share one session: a login, refresh or logout in another tab lands here.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      if (event.newValue === null) {
        // Logged out in another tab.
        if (this.sessionState()) {
          this.expireSession();
        }
        return;
      }
      this.adoptStoredSession();
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /**
   * The login response only carries { accessToken, expiresAt, permissions } —
   * everything else about the user (username, isDeveloper, isPremium,
   * permissions) lives in the JWT claims and is decoded on demand instead of
   * being persisted separately.
   */
  private claims = computed<JwtClaims | null>(() => {
    const session = this.sessionState();
    if (!session) {
      return null;
    }
    try {
      return jwtDecode<JwtClaims>(session.accessToken);
    } catch {
      return null;
    }
  });

  currentUser = computed<UserModel | null>(() => {
    const claims = this.claims();
    if (!claims) {
      return null;
    }
    return {
      id: claims.sub,
      username: claims.username,
      email: claims.email,
      // Backend claims serialize C# bools via ToString() -> "True"/"False".
      isDeveloper: claims.isDeveloper === 'True',
      isPremium: claims.isPremium === 'True',
    };
  });

  /** Backoffice guards read this — a user may hold zero, one, or many permission keys. */
  permissions = computed<string[]>(() => {
    const value = this.claims()?.permissions;
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  });

  /**
   * True while the access token is valid, or it expired but the refresh token can still renew it.
   * A plain method on purpose: it compares against the clock at call time (a `computed` would cache
   * the answer and keep saying "signed in" after the token expired).
   */
  isAuthenticated(): boolean {
    return this.hasValidAccessToken() || this.canRefresh();
  }

  hasValidAccessToken(leewayMs = 0): boolean {
    return isFuture(this.sessionState()?.expiresAt, leewayMs);
  }

  canRefresh(): boolean {
    const session = this.sessionState();
    return !!session?.refreshToken && isFuture(session.refreshTokenExpiresAt);
  }

  /** Emits whether this sign-in cancelled a pending account deletion (the caller shows a notice). */
  login(email: string, password: string): Observable<{ deletionCancelled: boolean }> {
    return this.http.post<AccessTokenResponse>('/api/auth/login', { email, password }).pipe(
      tap((response) => this.setSession(response)),
      map((response) => ({ deletionCancelled: response.deletionCancelled === true })),
    );
  }

  /**
   * Creates the account and emails a verification link — it does not sign in: login is refused
   * (403, code `EmailNotVerified`) until the link is opened.
   * `requestDeveloper` only files a request — an admin approves it in Backoffice → Users.
   */
  register(username: string, email: string, password: string, requestDeveloper: boolean): Observable<void> {
    return this.http
      .post<string>('/api/auth/register', { username, email, password, requestDeveloper })
      .pipe(map(() => void 0));
  }

  /** Always succeeds (the server never reveals whether the address has an account). */
  resendVerification(email: string): Observable<void> {
    return this.http.post<void>('/api/auth/resend-verification', { email });
  }

  /** Confirms a sign-up address or a changed address from the emailed link. */
  verifyEmail(token: string): Observable<VerifyEmailResponse> {
    return this.http.post<VerifyEmailResponse>('/api/auth/verify-email', { token });
  }

  /** Always succeeds (the server never reveals whether the address has an account). */
  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>('/api/auth/forgot-password', { email });
  }

  /** Sets a new password from the emailed link. The server signs out every session of that account. */
  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>('/api/auth/reset-password', { token, newPassword });
  }

  /**
   * Adopts a token pair the server issued outside login/refresh (password or username change) —
   * the old tokens stop working, and the new JWT carries the new username.
   */
  applySession(response: AccessTokenResponse): void {
    this.setSession(response);
  }

  /** Forgets the local session without calling the server (its tokens are already dead, e.g. after a reset). */
  forgetSession(): void {
    this.clearSession();
  }

  /**
   * Swaps the refresh token for a new access token (the server rotates the refresh token too).
   * Single-flight: concurrent callers (several 401s at once) share one request.
   */
  refreshSession(): Observable<string> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    // Another tab may already have rotated the token — use its result instead of spending ours.
    this.adoptStoredSession();
    if (this.hasValidAccessToken(REFRESH_LEEWAY_MS)) {
      return new Observable<string>((subscriber) => {
        subscriber.next(this.sessionState()!.accessToken);
        subscriber.complete();
      });
    }

    const refreshToken = this.sessionState()?.refreshToken;
    if (!refreshToken || !this.canRefresh()) {
      return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'No refresh token' }));
    }

    this.refreshInFlight = this.http.post<AccessTokenResponse>('/api/auth/refresh', { refreshToken }).pipe(
      tap((response) => this.setSession(response)),
      map((response) => response.accessToken),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight;
  }

  /** For the SignalR `accessTokenFactory`: the current token, renewed first when it has expired. */
  async getFreshToken(): Promise<string> {
    if (this.hasValidAccessToken(5_000) || !this.canRefresh()) {
      return this.getToken() ?? '';
    }
    try {
      return await firstValueFrom(this.refreshSession());
    } catch {
      return this.getToken() ?? '';
    }
  }

  /**
   * Best-effort server-side logout (invalidates the token's jti and the refresh token) — failures
   * are swallowed since the local session is cleared regardless. Navigation back to /login is left
   * to the caller. Skips the HTTP call entirely when there's no session (e.g. called after a failed
   * login attempt), since there's no token to invalidate and no point risking another 401.
   */
  logout(): void {
    const session = this.sessionState();
    if (session) {
      // Subscribing runs the interceptor synchronously, so the Authorization header is attached
      // before clearSession() below drops the token.
      this.http
        .post('/api/auth/logout', { refreshToken: session.refreshToken ?? null })
        .subscribe({ error: () => void 0 });
    }
    this.clearSession();
  }

  /** The session can't be renewed any more: drop it and send the user to /login. */
  expireSession(): void {
    this.clearSession();
    const url = this.router.url;
    if (!AUTH_PAGES.some((page) => url.startsWith(page))) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: url } });
    }
  }

  getToken(): string | null {
    return this.sessionState()?.accessToken ?? null;
  }

  private setSession(response: AccessTokenResponse): void {
    const previous = this.sessionState();
    const session: AuthSession = {
      accessToken: response.accessToken,
      expiresAt: response.expiresAt,
      refreshToken: response.refreshToken,
      refreshTokenExpiresAt: response.refreshTokenExpiresAt,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage full or blocked — the session still works for this tab.
    }
    if (previous && subjectOf(previous) !== subjectOf(session)) {
      this.sessionEndedSubject.next();
    }
    this.sessionState.set(session);
    this.scheduleRefresh();
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const hadSession = this.sessionState() !== null;
    this.sessionState.set(null);
    this.scheduleRefresh();
    if (hadSession) {
      this.sessionEndedSubject.next();
    }
  }

  /** Re-reads the session another tab wrote. */
  private adoptStoredSession(): void {
    const stored = loadSession();
    const current = this.sessionState();
    if (!stored || (stored.accessToken === current?.accessToken && stored.refreshToken === current?.refreshToken)) {
      return;
    }
    if (current && subjectOf(current) !== subjectOf(stored)) {
      // Another account signed in elsewhere: start clean rather than mixing two users' state. A full reload
      // rebuilds every per-user piece (hub connection, badges, loaded lists) for the new account; the current
      // URL may point at the previous user's data (e.g. one of their conversations), so land on the feed.
      this.sessionEndedSubject.next();
      window.location.assign('/feed');
      return;
    }
    this.sessionState.set(stored);
    this.scheduleRefresh();
  }

  /** Renews the access token shortly before it expires (only while a refresh token is available). */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const session = this.sessionState();
    if (!session?.refreshToken) {
      return;
    }
    // Small jitter so several open tabs don't all spend the same refresh token at once.
    const jitter = Math.floor(Math.random() * 10_000);
    const delay = Math.max(new Date(session.expiresAt).getTime() - Date.now() - REFRESH_LEEWAY_MS - jitter, 0);
    // setTimeout caps at ~24.8 days; a refresh that far out is re-armed by the next session change anyway.
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (!this.canRefresh()) {
        return;
      }
      this.refreshSession().subscribe({
        error: (error: unknown) => {
          // Only a rejected refresh token ends the session; a network blip just waits for the next request.
          if (isSessionRejected(error)) {
            this.expireSession();
          }
        },
      });
    }, Math.min(delay, 2_000_000_000));
  }
}
