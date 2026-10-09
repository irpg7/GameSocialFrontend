import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { BlockedUser } from '../../models/moderation.model';
import { MeService } from '../me/me.service';

/**
 * Blocking (`/api/users/{id}/block`). A block works both ways: neither side sees the other's posts, comments or
 * profile, and they can't follow, comment on, react to or invite each other (the server enforces it). Keeps
 * `MeService.me().blockedUserIds` in sync so the squad chat can fold a blocked member's messages right away.
 */
@Service()
export class BlockService {
  private http = inject(HttpClient);
  private me = inject(MeService);

  /** True when I blocked this user (the other direction isn't known to the client). */
  isBlocked(userId: string | null | undefined): boolean {
    return !!userId && (this.me.me()?.blockedUserIds ?? []).includes(userId);
  }

  block(userId: string): Observable<void> {
    return this.http.post<void>(`/api/users/${userId}/block`, {}).pipe(
      tap(() => {
        const ids = this.me.me()?.blockedUserIds ?? [];
        if (!ids.includes(userId)) {
          this.me.patch({ blockedUserIds: [...ids, userId] });
        }
      }),
    );
  }

  unblock(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/users/${userId}/block`).pipe(
      tap(() => this.me.patch({ blockedUserIds: (this.me.me()?.blockedUserIds ?? []).filter((id) => id !== userId) })),
    );
  }

  list(): Observable<BlockedUser[]> {
    return this.http.get<BlockedUser[]>('/api/users/me/blocks');
  }
}
