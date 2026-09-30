import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import { ReviewSummaryModel, ReviewWaitingGameModel, TrustedReviewerModel } from '../../models/review.model';

@Service()
export class ReviewService {
  private http = inject(HttpClient);

  /** Games you posted about (or drafted a review for) but haven't published a review of. Not paginated. */
  getWaiting(): Observable<ReviewWaitingGameModel[]> {
    return this.http.get<ReviewWaitingGameModel[]>('/api/reviews/waiting');
  }

  /** Ranked by total "Useful" votes received on the user's Review posts, descending. */
  getTrustedReviewers(page = 1, pageSize = 10): Observable<PagedResult<TrustedReviewerModel>> {
    return this.http.get<PagedResult<TrustedReviewerModel>>('/api/reviews/trusted-reviewers', {
      params: { page, pageSize },
    });
  }

  /**
   * Game summary card. Without `gameId` the server features the most-reviewed of
   * your followed games. Resolves to `null` (HTTP 204) when there are no reviews.
   */
  getSummary(gameId?: number | null): Observable<ReviewSummaryModel | null> {
    let params = new HttpParams();
    if (gameId != null) {
      params = params.set('gameId', gameId);
    }
    return this.http.get<ReviewSummaryModel | null>('/api/reviews/summary', { params });
  }
}
