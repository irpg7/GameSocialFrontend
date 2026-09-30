import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HotMomentModel } from '../../models/clip.model';

/** Clip-only reads that are not generic post operations. */
@Service()
export class ClipService {
  private http = inject(HttpClient);

  /** Hot moments of a clip, ordered by time (empty when nobody commented with a timestamp). */
  getHotMoments(postId: string): Observable<HotMomentModel[]> {
    return this.http.get<HotMomentModel[]>(`/api/posts/${postId}/hot-moments`);
  }
}
