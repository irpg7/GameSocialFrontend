import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../../models/paged-result.model';
import { ReviewWaitingGameModel, TrustedReviewerModel } from '../../models/review.model';

@Service()
export class ReviewService {
  private http = inject(HttpClient);

  /** Games the current user has posted a Clip/Devlog/Screenshots for but hasn't reviewed yet. Not paginated. */
  getWaiting(): Observable<ReviewWaitingGameModel[]> {
    return this.http.get<ReviewWaitingGameModel[]>('/api/reviews/waiting');
  }

  /** Ranked by total "Useful" votes received on the user's Review posts, descending. */
  getTrustedReviewers(page = 1, pageSize = 10): Observable<PagedResult<TrustedReviewerModel>> {
    return this.http.get<PagedResult<TrustedReviewerModel>>('/api/reviews/trusted-reviewers', {
      params: { page, pageSize },
    });
  }
}
