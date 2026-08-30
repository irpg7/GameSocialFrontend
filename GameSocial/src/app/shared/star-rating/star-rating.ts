import { Component, computed, input } from '@angular/core';

/**
 * Read-only 5-star reflection of a 0-10 score (each star = 2 points,
 * rounded to the nearest half star). Per the spec, rating is entered via a
 * plain numeric input elsewhere — this is display-only, not a click-to-rate
 * widget.
 */
@Component({
  selector: 'app-star-rating',
  templateUrl: './star-rating.html',
  styleUrl: './star-rating.scss',
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class StarRating {
  /** 0-10 scale, matching Domain.Responses.PostReviewDetailsResponse.Score. */
  score = input.required<number>();

  protected readonly stars = computed(() => {
    // Score is already 0-10, i.e. 0-10 half-star units across 5 stars (2 units/star).
    const halfUnits = Math.round(this.score());
    return Array.from({ length: 5 }, (_, i) => {
      const unit = i * 2;
      if (halfUnits >= unit + 2) return 'full';
      if (halfUnits === unit + 1) return 'half';
      return 'empty';
    });
  });

  protected readonly ariaLabel = computed(() => `${this.score()} out of 10`);
}
