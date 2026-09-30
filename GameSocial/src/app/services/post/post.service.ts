import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PostModel, PostPollModel, PostTypeName } from '../../models/post.model';
import { PagedResult } from '../../models/paged-result.model';

/** `GET /api/posts` sort: "hot"/"top" rank by engagement (votes·3 + comments·2 + views). */
export type PostSort = 'new' | 'hot' | 'top' | 'useful';

/** `GET /api/posts` window: lower bound on createdAt ("Hot today", "Top this week"). */
export type PostWindow = 'day' | 'week' | 'month';

/** Every optional query param of ListPostsQuery. Drafts are never listed. */
export interface PostListFilters {
  postType?: PostTypeName;
  gameId?: number;
  squadId?: string;
  userId?: string;
  sort?: PostSort;
  window?: PostWindow;
  /** Only people you follow. */
  followingOnly?: boolean;
  /** Only games you follow ("Games you play"). */
  followedGamesOnly?: boolean;
  /** Reviews: "20 h+ played only". */
  minHoursPlayed?: number;
  /** Reviews: "No spoilers". */
  spoilerFreeOnly?: boolean;
  tag?: string;
  /** Leave the currently playing clip out of an "Up next" list. */
  excludePostId?: string;
}

@Service()
export class PostService {
  private http = inject(HttpClient);
  private apiUrl = '/api/posts';

  getPosts(page = 1, pageSize = 10, filters?: PostListFilters): Observable<PagedResult<PostModel>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value !== undefined && value !== null && value !== '' && value !== false) {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<PagedResult<PostModel>>(this.apiUrl, { params });
  }

  /**
   * "Takip Ettiklerim" — `GET /api/posts/following`: your own posts plus people
   * and games you follow. Optional `postType` narrows it (Clips "Following").
   */
  getFollowingPosts(page = 1, pageSize = 10, postType?: PostTypeName): Observable<PagedResult<PostModel>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (postType) {
      params = params.set('postType', postType);
    }
    return this.http.get<PagedResult<PostModel>>(`${this.apiUrl}/following`, { params });
  }

  /** Single post (deep links, Clip Player). Drafts resolve only for their author. */
  getPost(postId: string): Observable<PostModel> {
    return this.http.get<PostModel>(`${this.apiUrl}/${postId}`);
  }

  /**
   * Backend expects multipart/form-data with PascalCase fields
   * (PostType, GameId, Caption/Title+Body, MediaType, PhotoType, Media,
   * MediaRoles, SquadId, IsDraft, Tags, Score/PlayStatus/HoursPlayed/SpoilerFree/
   * EmbeddedClipPostIds, PollOptions/ExpiresAt/HideResultsUntilVoted,
   * BuildTag/BranchTag/TestBranchUrl/PatchLinesJson). With IsDraft=true the post is
   * saved as a draft: hidden everywhere, no XP until publishDraft().
   */
  createPost(formData: FormData): Observable<PostModel> {
    return this.http.post<PostModel>(this.apiUrl, formData);
  }

  /** `POST posts/{postId}/poll-votes`, body `{ optionId }` — casting again changes the vote. */
  votePoll(postId: string, optionId: string): Observable<PostPollModel> {
    return this.http.post<PostPollModel>(`${this.apiUrl}/${postId}/poll-votes`, { optionId });
  }

  /** "◇ Save" / "◆ Saved" / ◷ watch later toggle. Awards no XP. */
  toggleSave(postId: string): Observable<{ saved: boolean }> {
    return this.http.post<{ saved: boolean }>(`${this.apiUrl}/${postId}/save`, {});
  }

  /** Account menu "◇ Kaydedilenler", newest save first. */
  getSavedPosts(page = 1, pageSize = 20, postType?: PostTypeName): Observable<PagedResult<PostModel>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (postType) {
      params = params.set('postType', postType);
    }
    return this.http.get<PagedResult<PostModel>>(`${this.apiUrl}/saved`, { params });
  }

  /** Counts one unique view per user; call once playback has actually started. */
  recordView(postId: string): Observable<{ viewCount: number }> {
    return this.http.post<{ viewCount: number }>(`${this.apiUrl}/${postId}/view`, {});
  }

  /** Account menu "◫ Taslaklar". */
  getDrafts(postType?: PostTypeName): Observable<PostModel[]> {
    let params = new HttpParams();
    if (postType) {
      params = params.set('postType', postType);
    }
    return this.http.get<PostModel[]>(`${this.apiUrl}/drafts`, { params });
  }

  /** Publishes a draft — XP, streak and achievements are awarded now. */
  publishDraft(postId: string): Observable<PostModel> {
    return this.http.post<PostModel>(`${this.apiUrl}/${postId}/publish`, {});
  }

  deleteDraft(postId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/drafts/${postId}`);
  }
}
