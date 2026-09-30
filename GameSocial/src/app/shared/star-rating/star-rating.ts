import { Component, computed, input, model, signal } from '@angular/core';

/**
 * Five-star reflection of a 0-10 score (each star = 2 points).
 *
 * Display mode (default): the design's glyph stars — `★★★★` in brand red and
 * the rest in #3a3a44 — rounded to whole stars, exactly like the review cards.
 *
 * Interactive mode (`interactive`): the Write-a-review sheet's click-to-rate
 * row. Clicking the left/right half of a star sets a half-star value
 * (1.0 steps on the 0-10 scale); arrow keys nudge by 0.1 (Shift: 1.0) so any
 * one-decimal score like 8.4 is reachable. Stars fill proportionally while
 * interactive so the chosen decimal is visible. `score` is a model, so bind
 * `[(score)]` there; one-way `[score]` keeps working for display.
 */
@Component({
  selector: 'app-star-rating',
  templateUrl: './star-rating.html',
  styleUrl: './star-rating.scss',
  host: {
    '[attr.role]': 'interactive() ? "slider" : "img"',
    '[attr.aria-label]': 'interactive() ? "Puan" : ariaLabel()',
    '[attr.aria-valuemin]': 'interactive() ? 0 : null',
    '[attr.aria-valuemax]': 'interactive() ? 10 : null',
    '[attr.aria-valuenow]': 'interactive() ? score() : null',
    '[attr.aria-valuetext]': 'interactive() ? ariaLabel() : null',
    '[attr.tabindex]': 'interactive() ? 0 : null',
    '[class.interactive]': 'interactive()',
    '[style.--star-size]': 'size() + "px"',
    '(keydown)': 'onKey($event)',
    '(mouseleave)': 'hover.set(null)',
  },
})
export class StarRating {
  /** 0-10 scale, one decimal — Domain.Responses.PostReviewDetailsResponse.Score. */
  readonly score = model<number>(0);
  readonly interactive = input(false);
  /** Glyph size in px (cards 11, sheet 22). */
  readonly size = input(11);

  protected readonly hover = signal<number | null>(null);

  /** Per-star fill 0..1. */
  protected readonly fills = computed(() => {
    const value = this.hover() ?? this.score();
    const stars = this.interactive() ? value / 2 : Math.round(value / 2);
    return Array.from({ length: 5 }, (_, i) => Math.max(0, Math.min(1, stars - i)));
  });

  protected readonly ariaLabel = computed(() => `${this.score().toFixed(1)} / 10`);

  protected valueAt(index: number, event: MouseEvent): number {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const leftHalf = event.clientX - rect.left < rect.width / 2;
    return index * 2 + (leftHalf ? 1 : 2);
  }

  protected onMove(index: number, event: MouseEvent): void {
    if (this.interactive()) {
      this.hover.set(this.valueAt(index, event));
    }
  }

  protected onClick(index: number, event: MouseEvent): void {
    if (this.interactive()) {
      this.score.set(this.valueAt(index, event));
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.interactive()) {
      return;
    }
    const step = event.shiftKey ? 1 : 0.1;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = this.score() + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = this.score() - step;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 10;
        break;
    }
    if (next !== null) {
      event.preventDefault();
      this.score.set(Math.round(Math.max(0, Math.min(10, next)) * 10) / 10);
    }
  }
}
