import { Component, input, output } from '@angular/core';

/**
 * Generic full-screen modal "sheet" shell — backdrop + panel + header (title
 * + close button) + a content-projected body. Used by the Review, Poll, and
 * Devlog composer forms so the overlay/backdrop/close chrome exists exactly
 * once instead of being duplicated per sheet (per the Phase 2 brief).
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
  closed = output<void>();
}
