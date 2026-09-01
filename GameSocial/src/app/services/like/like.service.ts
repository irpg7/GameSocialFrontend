import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Corresponds to Domain.Responses.LikeResponse. */
export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

@Service()
export class LikeService {
  private http = inject(HttpClient);

  /** Toggles the current user's like on a post; the backend flips it on/off. */
  toggleLike(postId: string): Observable<LikeResult> {
    return this.http.post<LikeResult>(`/api/posts/${postId}/like`, {});
  }

  /**
   * Toggles the current user's "useful" vote on a Review post — same
   * PostInteraction mechanism/response shape as toggleLike, a distinct route
   * restricted server-side to Review posts (400 otherwise). Confirmed by
   * reading WebApi/Endpoints/Posts/Useful/ToggleUsefulEndpoint.cs directly:
   * `POST posts/{postId}/useful`.
   */
  toggleUseful(postId: string): Observable<LikeResult> {
    return this.http.post<LikeResult>(`/api/posts/${postId}/useful`, {});
  }
}
