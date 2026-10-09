import { Component, input, output } from '@angular/core';
import { BackdropClose } from '../overlay/backdrop-close';
import { DialogFocus } from '../overlay/dialog-focus';

/**
 * Phone bottom sheet — the mobile counterpart of `sheet-modal`: a scrim plus a panel that rises from
 * the bottom edge (grab handle, title, square close button, scrolling body). Used where the desktop
 * shows a side panel or a hover strip: the squad room's members sheet and message actions.
 *
 * Like `sheet-modal`, the parent owns visibility (wrap usage in an `@if`). Focus moves into the panel
 * and stays there (`appDialog`); Escape (top-most sheet only) and a click on the scrim close it.
 */
@Component({
  selector: 'app-bottom-sheet',
  imports: [BackdropClose, DialogFocus],
  template: `
    <div class="bs-backdrop" appBackdropClose (backdropClose)="closed.emit()">
      <section
        class="bs-panel"
        [class.bs-tall]="tall()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        tabindex="-1"
        appDialog
        (dialogEscape)="closed.emit()"
        (click)="$event.stopPropagation()">
        <span class="bs-grab" aria-hidden="true"></span>
        @if (!hideHeader()) {
          <header class="bs-header">
            <h2 class="bs-title">{{ title() }}</h2>
            <button type="button" class="bs-close" aria-label="Kapat" (click)="closed.emit()">&#10005;</button>
          </header>
        }
        <div class="bs-body">
          <ng-content></ng-content>
        </div>
      </section>
    </div>
  `,
  styleUrl: './bottom-sheet.scss',
})
export class BottomSheet {
  title = input.required<string>();
  /** Fixed ~76% height (lists that scroll inside), instead of fitting the content. */
  tall = input(false);
  /** Action sheets show their own preview instead of a title row; the title stays as the dialog's label. */
  hideHeader = input(false);
  closed = output<void>();
}
