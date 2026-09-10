import { Component, input, output } from '@angular/core';

/**
 * Generic modal "sheet" shell — backdrop + panel + header (title, optional
 * subtitle, close button) + a content-projected body. Used by the Squad,
 * Review, Poll and Devlog forms so the overlay/backdrop/close chrome exists
 * exactly once instead of being duplicated per sheet.
 *
 * The chrome follows Gamer Feed.dc.html's sheet states (sheetSquad /
 * sheetReview / sheetClip / sheetPoll / sheetDevlog), which are one shared
 * shell in the design too: 620px wide, 26px radius, a title with one line of
 * guidance under it, and a square close button in the top-right corner.
 *
 * The parent owns visibility (wrap usage in an `@if`) — this component has
 * no internal open/closed state of its own.
 */
@Component({
  selector: 'app-sheet-modal',
  templateUrl: './sheet-modal.html',
  styleUrl: './sheet-modal.scss',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class SheetModal {
  title = input.required<string>();
  /** The design pairs every sheet title with one line of guidance under it. */
  subtitle = input<string | undefined>(undefined);
  closed = output<void>();
}
