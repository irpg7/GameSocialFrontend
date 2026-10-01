import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CommentModel, CommentSort, CommentVoteModel } from '../../models/comment.model';
import { PagedResult } from '../../models/paged-result.model';

export interface CommentListOptions {
  /** Default "oldest". Pinned developer replies always come first. */
  sort?: CommentSort;
  /** Omit for top-level comments; pass a comment id to list its replies. */
  parentCommentId?: string;
}

export interface CreateCommentOptions {
  /** Clip comments: current player time in seconds ("@0:12"). */
  timestampSeconds?: number;
  /** "↩ Yanıtla" — replying to a reply attaches to its top-level parent. */
  parentCommentId?: string;
}

@Service()
export class CommentService {
  private http = inject(HttpClient);

  list(postId: string, page = 1, pageSize = 20, options?: CommentListOptions): Observable<PagedResult<CommentModel>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (options?.sort) {
      params = params.set('sort', options.sort);
    }
    if (options?.parentCommentId) {
      params = params.set('parentCommentId', options.parentCommentId);
    }
    return this.http.get<PagedResult<CommentModel>>(`/api/posts/${postId}/comments`, { params });
  }

  create(postId: string, body: string, options?: CreateCommentOptions): Observable<CommentModel> {
    return this.http.post<CommentModel>(`/api/posts/${postId}/comments`, {
      body,
      timestampSeconds: options?.timestampSeconds ?? null,
      parentCommentId: options?.parentCommentId ?? null,
    });
  }

  /** Route is nested under the post (posts/{postId}/comments/{commentId}), not a flat comments collection. */
  delete(postId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(`/api/posts/${postId}/comments/${commentId}`);
  }

  /** Author only — edits the text; the server sets editedAt. */
  update(postId: string, commentId: string, body: string): Observable<CommentModel> {
    return this.http.put<CommentModel>(`/api/posts/${postId}/comments/${commentId}`, { body });
  }

  /** "▲ n" toggle on a comment. */
  toggleVote(postId: string, commentId: string): Observable<CommentVoteModel> {
    return this.http.post<CommentVoteModel>(`/api/posts/${postId}/comments/${commentId}/vote`, {});
  }
}
