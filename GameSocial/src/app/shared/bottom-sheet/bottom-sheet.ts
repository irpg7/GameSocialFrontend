import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

/**
 * Phone bottom sheet — the mobile counterpart of `sheet-modal`: a scrim plus a panel that rises from
 * the bottom edge (grab handle, title, square close button, scrolling body). Used where the desktop
 * shows a side panel or a hover strip: the squad room's members sheet and message actions.
 *
 * Like `sheet-modal`, the parent owns visibility (wrap usage in an `@if`). Focus moves into the panel
 * when it opens; Escape and the scrim close it.
 */
@Component({
  selector: 'app-bottom-sheet',
  template: `
    <div class="bs-backdrop" (click)="closed.emit()">
      <section
        #panel
        class="bs-panel"
        [class.bs-tall]="tall()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        tabindex="-1"
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
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class BottomSheet {
  title = input.required<string>();
  /** Fixed ~76% height (lists that scroll inside), instead of fitting the content. */
  tall = input(false);
  /** Action sheets show their own preview instead of a title row; the title stays as the dialog's label. */
  hideHeader = input(false);
  closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus());
  }
}
