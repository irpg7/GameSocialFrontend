import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input, output } from '@angular/core';
import { OverlayStack } from './overlay-stack.service';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), ' +
  'textarea:not([disabled]), iframe, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * Focus handling for a dialog panel (`role="dialog"`):
 * - on open, focus moves inside (first match of `dialogInitialFocus`, else the panel itself);
 * - Tab / Shift+Tab cycle inside the panel;
 * - Escape emits `dialogEscape` only when this is the top-most open dialog, so stacked sheets
 *   close one at a time;
 * - on close, focus returns to the element that opened it.
 */
@Directive({
  selector: '[appDialog]',
  host: {
    '(keydown)': 'onKeydown($event)',
    '(document:keydown.escape)': 'onEscape($event)',
  },
})
export class DialogFocus implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly stack = inject(OverlayStack);
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /**
   * What to focus on open: a CSS selector, or a list of them tried in order. Falls back to the
   * panel itself.
   */
  dialogInitialFocus = input<string | readonly string[] | undefined>(undefined);
  dialogEscape = output<void>();

  constructor() {
    this.stack.push(this);
    afterNextRender(() => {
      const panel = this.host.nativeElement;
      if (panel.contains(document.activeElement)) {
        return;
      }
      const wanted = this.dialogInitialFocus();
      const selectors = wanted === undefined ? [] : typeof wanted === 'string' ? [wanted] : wanted;
      for (const selector of selectors) {
        const target = panel.querySelector<HTMLElement>(selector);
        if (target) {
          target.focus();
          return;
        }
      }
      if (!panel.hasAttribute('tabindex')) {
        panel.setAttribute('tabindex', '-1');
      }
      panel.focus();
    });
  }

  ngOnDestroy(): void {
    this.stack.remove(this);
    const active = document.activeElement;
    // Only hand focus back when it would otherwise be lost (inside the closing panel or on <body>).
    const focusLost = !active || active === document.body || this.host.nativeElement.contains(active);
    if (focusLost && this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  protected onEscape(event: Event): void {
    if (!this.stack.isTop(this) || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    this.dialogEscape.emit();
  }

  protected onKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    // A nested dialog's Tab bubbles up through this panel too; only the top-most one traps.
    if (keyboardEvent.key !== 'Tab' || keyboardEvent.defaultPrevented || !this.stack.isTop(this)) {
      return;
    }
    const panel = this.host.nativeElement;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getClientRects().length > 0,
    );
    if (focusable.length === 0) {
      keyboardEvent.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (keyboardEvent.shiftKey && (active === first || active === panel)) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && active === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }
}
