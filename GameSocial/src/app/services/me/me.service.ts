import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { MeModel } from '../../models/me.model';

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

  refresh(): Observable<MeModel> {
    return this.http.get<MeModel>('/api/users/me').pipe(tap((me) => this.meState.set(me)));
  }
}
