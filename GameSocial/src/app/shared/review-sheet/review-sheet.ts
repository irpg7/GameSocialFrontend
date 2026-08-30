import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameModel } from '../../models/game.model';
import { PostModel } from '../../models/post.model';
import { PlayStatus, PostMediaType, PostType } from '../../models/post-enums.model';
import { PostService } from '../../services/post/post.service';
import { MeService } from '../../services/me/me.service';
import { extractApiErrorMessage } from '../api-error.util';
import { SheetModal } from '../sheet-modal/sheet-modal';
import { StarRating } from '../star-rating/star-rating';

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;

/**
 * "Write a review" modal sheet. Factored out of PostComposer in Phase 3 so
 * both the Feed composer and the Reviews page can open the exact same form
 * instead of duplicating it — submits through PostService.createPost
 * directly, same as every other post type.
 *
 * Review's contract (confirmed by reading CreatePostCommandValidator.cs
 * directly): there is no Title field at all — Caption is the one required
 * "headline" field, and Body now persists for real via
 * PostReviewDetailsResponse.Body.
 */
@Component({
  selector: 'app-review-sheet',
  imports: [FormsModule, SheetModal, StarRating],
  templateUrl: './review-sheet.html',
  styleUrl: './review-sheet.scss',
})
export class ReviewSheet {
  private postService = inject(PostService);
  private meService = inject(MeService);

  games = input.required<GameModel[]>();
  /** Optional pre-fill — e.g. the Reviews page's "Waiting for your review" Rate CTA. */
  preselectedGameId = input<number | null>(null);

  closed = output<void>();
  posted = output<PostModel>();

  protected readonly PlayStatus = PlayStatus;
  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly maxBodyLength = MAX_BODY_LENGTH;

  protected readonly gameId = linkedSignal(() => this.preselectedGameId());
  protected readonly headline = signal('');
  protected readonly body = signal('');
  protected readonly score = signal(7);
  protected readonly hoursPlayed = signal<number | null>(null);
  protected readonly playStatus = signal<PlayStatus>(PlayStatus.Finished);
  protected readonly spoilerFree = signal(false);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  submit(): void {
    this.errorMessage.set(null);
    const validationError = this.validate();
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    this.isSubmitting.set(true);
    this.postService
      .createPost(this.buildFormData())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (post) => {
          this.posted.emit(post);
          // Publishing a review awards +200 XP — refresh live state.
          this.meService.refresh().subscribe({ error: () => void 0 });
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to publish review. Please try again.')),
      });
  }

  private validate(): string | null {
    if (this.gameId() === null) {
      return 'Please select a game.';
    }
    if (!this.headline().trim()) {
      return 'Headline is required.';
    }
    if (this.headline().length > MAX_TITLE_LENGTH) {
      return `Headline must be ${MAX_TITLE_LENGTH} characters or fewer.`;
    }
    if (!this.body().trim()) {
      return 'Review body is required.';
    }
    if (this.body().length > MAX_BODY_LENGTH) {
      return `Body must be ${MAX_BODY_LENGTH} characters or fewer.`;
    }
    if (this.score() < 0 || this.score() > 10) {
      return 'Score must be between 0 and 10.';
    }
    if (this.hoursPlayed() === null || this.hoursPlayed()! < 0) {
      return 'Please enter hours played (0 or more).';
    }
    return null;
  }

  private buildFormData(): FormData {
    const formData = new FormData();
    formData.append('PostType', String(PostType.Review));
    formData.append('GameId', String(this.gameId()));
    formData.append('Caption', this.headline().trim());
    formData.append('Body', this.body().trim());
    formData.append('Score', String(this.score()));
    formData.append('PlayStatus', String(this.playStatus()));
    formData.append('HoursPlayed', String(this.hoursPlayed()));
    formData.append('SpoilerFree', String(this.spoilerFree()));
    formData.append('MediaType', String(PostMediaType.Photo));
    return formData;
  }
}
