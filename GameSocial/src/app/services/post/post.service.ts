import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PostModel, PostPollModel, PostTypeName } from '../../models/post.model';
import { PagedResult } from '../../models/paged-result.model';

export interface PostListFilters {
  postType?: PostTypeName;
  gameId?: number;
  squadId?: number;
}

@Service()
export class PostService {
  private http = inject(HttpClient);
  private apiUrl = '/api/posts';

  /**
   * `postType`/`gameId`/`squadId` are confirmed real optional query params on
   * `GET /api/posts` (ListPostsQuery) — `postType` binds by enum name, e.g.
   * `?postType=Review`.
   */
  getPosts(page = 1, pageSize = 10, filters?: PostListFilters): Observable<PagedResult<PostModel>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters?.postType) {
      params = params.set('postType', filters.postType);
    }
    if (filters?.gameId != null) {
      params = params.set('gameId', filters.gameId);
    }
    if (filters?.squadId != null) {
      params = params.set('squadId', filters.squadId);
    }
    return this.http.get<PagedResult<PostModel>>(this.apiUrl, { params });
  }

  /**
   * Backend expects multipart/form-data with PascalCase fields
   * (PostType, GameId, Caption/Title+Body, MediaType, PhotoType, Media,
   * SquadId, Score/PlayStatus/HoursPlayed/SpoilerFree, PollOptions/
   * ExpiresAt/HideResultsUntilVoted, BuildTag/BranchTag/PatchLinesJson) —
   * see PostComposer for how the FormData is assembled per post type.
   */
  createPost(formData: FormData): Observable<PostModel> {
    return this.http.post<PostModel>(this.apiUrl, formData);
  }

  /**
   * Casts (or changes) the current user's vote on a poll post. Confirmed by
   * reading WebApi/Endpoints/Posts/PollVote/CastPollVoteEndpoint.cs directly:
   * `POST posts/{postId}/poll-votes`, body `{ optionId }`. No separate
   * PollService exists — polls have no CRUD beyond voting; creation goes
   * through the normal create-post flow.
   */
  votePoll(postId: number, optionId: number): Observable<PostPollModel> {
    return this.http.post<PostPollModel>(`${this.apiUrl}/${postId}/poll-votes`, { optionId });
  }
}
