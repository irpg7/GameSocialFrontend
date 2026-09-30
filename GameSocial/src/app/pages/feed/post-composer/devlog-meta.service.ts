import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Domain.Responses.GameFollowerCountResponse — "12.4k followers will be notified". */
export interface GameFollowerCountModel {
  gameId: number;
  followerCount: number;
}

/** Domain.Responses.DevlogNextSequenceResponse — the "DEVLOG #15" badge + identity card. */
export interface DevlogNextSequenceModel {
  gameId: number;
  gameName: string;
  studio?: string;
  sequence: number;
  /** False when the game belongs to another developer account (publishing would be rejected). */
  canPublish: boolean;
}

/**
 * The two read-only lookups the New DevLog sheet makes for the picked game.
 * Kept next to the composer (its only consumer) rather than on GameService.
 */
@Service()
export class DevlogMetaService {
  private http = inject(HttpClient);

  followerCount(gameId: number): Observable<GameFollowerCountModel> {
    return this.http.get<GameFollowerCountModel>(`/api/games/${gameId}/followers/count`);
  }

  nextSequence(gameId: number): Observable<DevlogNextSequenceModel> {
    return this.http.get<DevlogNextSequenceModel>(`/api/games/${gameId}/devlogs/next-sequence`);
  }
}
