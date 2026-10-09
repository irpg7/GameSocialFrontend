import { Directive, output } from '@angular/core';

/**
 * Emits `backdropClose` for a click that both started and ended on the backdrop element itself.
 * A plain `(click)` fires on the backdrop when a text selection drag starts inside the panel and
 * the pointer is released outside it — that used to close sheets mid-selection.
 */
@Directive({
  selector: '[appBackdropClose]',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(click)': 'onClick($event)',
  },
})
export class BackdropClose {
  backdropClose = output<void>();

  private pressedOnBackdrop = false;

  protected onPointerDown(event: PointerEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  protected onClick(event: MouseEvent): void {
    const pressed = this.pressedOnBackdrop;
    this.pressedOnBackdrop = false;
    if (pressed && event.target === event.currentTarget) {
      this.backdropClose.emit();
    }
  }
}
