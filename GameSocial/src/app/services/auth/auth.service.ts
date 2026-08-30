import { Service, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { AccessTokenResponse, AuthSession, JwtClaims } from '../../models/auth.model';
import { UserModel } from '../../models/user.model';

const STORAGE_KEY = 'gamesocial_auth';

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

@Service()
export class AuthService {
  private http = inject(HttpClient);

  private sessionState = signal<AuthSession | null>(loadSession());

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

  isAuthenticated = computed<boolean>(() => {
    const session = this.sessionState();
    if (!session) {
      return false;
    }
    return new Date(session.expiresAt).getTime() > Date.now();
  });

  /** Backoffice guards read this — a user may hold zero, one, or many permission keys. */
  permissions = computed<string[]>(() => {
    const value = this.claims()?.permissions;
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  });

  login(email: string, password: string): Observable<void> {
    return this.http.post<AccessTokenResponse>('/api/auth/login', { email, password }).pipe(
      tap((response) => this.setSession(response)),
      map(() => void 0),
    );
  }

  /** Register does not return a token — chain straight into login on success. */
  register(username: string, email: string, password: string, isDeveloper: boolean): Observable<void> {
    return this.http
      .post<number>('/api/auth/register', { username, email, password, isDeveloper })
      .pipe(switchMap(() => this.login(email, password)));
  }

  /**
   * Best-effort server-side logout (invalidates the token's jti) — failures
   * are swallowed since the local session is cleared regardless. Navigation
   * back to /login is left to the caller. Skips the HTTP call entirely when
   * there's no session (e.g. called after a failed login attempt), since
   * there's no token to invalidate and no point risking another 401.
   */
  logout(): void {
    if (this.sessionState()) {
      this.http.post('/api/auth/logout', {}).subscribe({ error: () => void 0 });
    }
    this.clearSession();
  }

  getToken(): string | null {
    return this.sessionState()?.accessToken ?? null;
  }

  private setSession(response: AccessTokenResponse): void {
    const session: AuthSession = { accessToken: response.accessToken, expiresAt: response.expiresAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.sessionState.set(session);
  }

  private clearSession(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionState.set(null);
  }
}
