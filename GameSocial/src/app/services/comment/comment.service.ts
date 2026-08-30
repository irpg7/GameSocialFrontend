import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CommentModel } from '../../models/comment.model';
import { PagedResult } from '../../models/paged-result.model';

@Service()
export class CommentService {
  private http = inject(HttpClient);

  list(postId: number, page = 1, pageSize = 20): Observable<PagedResult<CommentModel>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<CommentModel>>(`/api/posts/${postId}/comments`, { params });
  }

  create(postId: number, body: string): Observable<CommentModel> {
    return this.http.post<CommentModel>(`/api/posts/${postId}/comments`, { body });
  }

  /** Route is nested under the post (posts/{postId}/comments/{commentId}), not a flat comments collection. */
  delete(postId: number, commentId: number): Observable<void> {
    return this.http.delete<void>(`/api/posts/${postId}/comments/${commentId}`);
  }
}
