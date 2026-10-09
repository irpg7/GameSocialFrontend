import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { MeModel, PresenceStatusName } from '../../models/me.model';

/**
 * Live "gamification state" for the current user (xp, level, streak, ...),
 * distinct from AuthService (which only decodes the static JWT claims).
 *
 * Refresh strategy: MainLayout calls refresh() once on app init. Beyond
 * that, any feature that can plausibly award XP, change the streak, or
 * unlock an achievement (creating a post, toggling a like/useful vote,
 * casting a poll vote, joining a squad, ...) should call refresh() again
 * after its action succeeds so the header/sidebar pick up the change —
 * there is no timer-based polling.
 */
@Service()
export class MeService {
  private http = inject(HttpClient);

  private meState = signal<MeModel | null>(null);
  readonly me = this.meState.asReadonly();

  constructor() {
    // Never show the previous account's profile after a logout or account switch.
    inject(AuthService)
      .sessionEnded$.pipe(takeUntilDestroyed())
      .subscribe(() => this.meState.set(null));
  }

  refresh(): Observable<MeModel> {
    return this.http.get<MeModel>('/api/users/me').pipe(tap((me) => this.meState.set(me)));
  }

  /** Replaces `me` with a fresh copy an account call returned (e.g. PUT users/me/profile). */
  set(me: MeModel): void {
    this.meState.set(me);
  }

  /** Applies a partial change an account call confirmed (avatar, pending email, …). */
  patch(changes: Partial<MeModel>): void {
    const current = this.meState();
    if (current) {
      this.meState.set({ ...current, ...changes });
    }
  }

  /** Account menu status row ("değiştir" cycles it). Optimistically updates `me`. */
  setStatus(status: PresenceStatusName): Observable<void> {
    const current = this.meState();
    if (current) {
      this.meState.set({ ...current, presenceStatus: status });
    }
    return this.http.put<void>('/api/users/me/status', { status });
  }

  /** Undoes `setStatus`'s optimistic update when the request fails. */
  revertStatus(status: PresenceStatusName): void {
    const current = this.meState();
    if (current) {
      this.meState.set({ ...current, presenceStatus: status });
    }
  }

  /**
   * Presence ping — "online" means a heartbeat in the last 2 minutes. `activity`
   * is the free-text roster line ("Ashfall · Boss 7 · 2. deneme").
   */
  heartbeat(activity?: string): Observable<void> {
    return this.http.post<void>('/api/users/me/heartbeat', { activity: activity ?? null });
  }

  /** Onboarding finished or skipped: it is not shown again (on any device). */
  completeOnboarding(): Observable<void> {
    return this.http.post<void>('/api/users/me/onboarding/complete', {}).pipe(
      tap(() => {
        const current = this.meState();
        if (current) {
          this.meState.set({ ...current, needsOnboarding: false });
        }
      }),
    );
  }
}
