import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AccessTokenResponse, AccountDeletionResponse } from '../../models/auth.model';
import { ActivityVisibilityName, MeModel, MessagePermissionName } from '../../models/me.model';
import { AuthService } from '../auth/auth.service';
import { MeService } from '../me/me.service';

/**
 * Account settings for the signed-in user (`/api/users/me/...`): profile, avatar, username, email and
 * password. Keeps `MeService.me()` in sync, and adopts the new token pair the server issues when the
 * JWT's contents change (username) or every other session is signed out (password).
 */
@Service()
export class AccountService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private me = inject(MeService);
  private apiUrl = '/api/users/me';

  /** Bio and (developer accounts only) studio name. Empty text clears a field. */
  updateProfile(bio: string, studioName: string | null): Observable<MeModel> {
    return this.http
      .put<MeModel>(`${this.apiUrl}/profile`, { bio, studioName })
      .pipe(tap((me) => this.me.set(me)));
  }

  uploadAvatar(file: File): Observable<string | null> {
    const body = new FormData();
    body.append('avatar', file);
    return this.http.post<{ avatarUrl: string | null }>(`${this.apiUrl}/avatar`, body).pipe(
      map((response) => response.avatarUrl),
      tap((avatarUrl) => this.me.patch({ avatarUrl: avatarUrl ?? undefined })),
    );
  }

  removeAvatar(): Observable<void> {
    return this.http.delete<{ avatarUrl: string | null }>(`${this.apiUrl}/avatar`).pipe(
      tap(() => this.me.patch({ avatarUrl: undefined })),
      map(() => void 0),
    );
  }

  /** Allowed once per cooldown period; the JWT carries the username, so a new token pair comes back. */
  changeUsername(username: string): Observable<void> {
    return this.http.put<AccessTokenResponse>(`${this.apiUrl}/username`, { username }).pipe(
      tap((session) => this.auth.applySession(session)),
      map(() => void 0),
    );
  }

  /** Sends a confirmation link to the new address; the email only changes once that link is opened. */
  changeEmail(newEmail: string, currentPassword: string): Observable<string | null> {
    return this.http
      .post<{ pendingEmail: string | null }>(`${this.apiUrl}/email`, { newEmail, currentPassword })
      .pipe(
        map((response) => response.pendingEmail),
        tap((pendingEmail) => this.me.patch({ pendingEmail })),
      );
  }

  cancelEmailChange(): Observable<void> {
    return this.http.delete<{ pendingEmail: null }>(`${this.apiUrl}/email/pending`).pipe(
      tap(() => this.me.patch({ pendingEmail: null })),
      map(() => void 0),
    );
  }

  /** Settings → Privacy. Returns (and stores) the fresh `me`. */
  updatePrivacy(settings: {
    allowMessagesFrom: MessagePermissionName;
    showOnlineStatus: boolean;
    profileActivityVisibility: ActivityVisibilityName;
  }): Observable<MeModel> {
    return this.http.put<MeModel>(`${this.apiUrl}/privacy`, settings).pipe(tap((me) => this.me.set(me)));
  }

  /** Signs out every other session; this one continues with the fresh token pair the server returns. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<AccessTokenResponse>(`${this.apiUrl}/password`, { currentPassword, newPassword })
      .pipe(
        tap((session) => this.auth.applySession(session)),
        map(() => void 0),
      );
  }

  /**
   * Schedules the account for deletion (the server re-checks the password and refuses while the user is the only
   * captain of a squad with other members). Every session ends server-side, so the local one is dropped too —
   * the caller navigates to /login. Resolves to when the account will be deleted.
   */
  requestDeletion(password: string): Observable<string> {
    return this.http.post<AccountDeletionResponse>(`${this.apiUrl}/deletion`, { password }).pipe(
      tap(() => this.auth.forgetSession()),
      map((response) => response.scheduledFor),
    );
  }

  /** KVKK export: fetches everything the account holds and saves it as a JSON file (once per 24 h, server-side). */
  downloadMyData(): Observable<void> {
    return this.http.get<{ exportedAt?: string }>(`${this.apiUrl}/export`).pipe(
      map((data) => {
        const stamp = (data.exportedAt ?? new Date().toISOString()).slice(0, 10).replaceAll('-', '');
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `tavern-data-${stamp}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
  }
}
