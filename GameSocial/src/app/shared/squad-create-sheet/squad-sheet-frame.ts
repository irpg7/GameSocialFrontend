import { Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

let nextFrameId = 0;

/**
 * The design's squad sheet shell (08-sheets `sheetSquad`, 07 `sqSettings`):
 * a near-black scrim, a #101014 panel with a 26px radius and deep shadow, and
 * a header of [optional 44px icon] + 800 20/26 title + one muted line + a
 * 34px square close button. Width differs per sheet (620 create, 600
 * settings), so it is an input.
 *
 * Project the header icon with `<… sheet-icon>`; everything else is body.
 */
@Component({
  selector: 'app-squad-sheet-frame',
  template: `
    <div class="frame-scrim" (click)="closed.emit()">
      <div
        class="frame-panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [style.width.px]="width()"
        (click)="$event.stopPropagation()">
        <div class="frame-head">
          <ng-content select="[sheet-icon]" />
          <div class="frame-heading">
            <h2 class="frame-title" [id]="titleId">{{ title() }}</h2>
            @if (subtitle(); as sub) {
              <p class="frame-sub">{{ sub }}</p>
            }
          </div>
          <button type="button" class="frame-close" aria-label="Close" (click)="closed.emit()">✕</button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './squad-sheet-frame.scss',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class SquadSheetFrame {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  title = input.required<string>();
  subtitle = input<string | undefined>(undefined);
  width = input(620);
  closed = output<void>();

  protected readonly titleId = `squad-sheet-title-${nextFrameId++}`;

  constructor() {
    // Move focus into the dialog so keyboard users land inside it.
    afterNextRender(() => {
      const first = this.host.nativeElement.querySelector<HTMLElement>(
        '.frame-panel input, .frame-panel textarea, .frame-panel select, .frame-panel [role=tab], .frame-panel button:not(.frame-close)',
      );
      (first ?? this.host.nativeElement.querySelector<HTMLElement>('.frame-close'))?.focus();
    });
  }
}
