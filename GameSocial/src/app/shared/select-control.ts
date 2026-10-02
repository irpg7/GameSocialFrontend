import { DestroyRef, Directive, ElementRef, afterNextRender, afterRenderEffect, inject, input, model, output } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

/**
 * Signal Forms control for native `<select>` elements — import it wherever a `<select [formField]>` is used.
 *
 * Why it exists: the app's selects are Chrome's customizable select (`<button><selectedcontent>` inside).
 * Signal Forms' built-in select handling watches the whole `<select>` subtree with a MutationObserver
 * and writes the value back on every change; Chrome re-renders `<selectedcontent>` on every value
 * write, which is itself a subtree change → an endless loop that crashes the tab. With this directive
 * on the element, `[formField]` treats the select as a custom control (`FormValueControl`) and the
 * built-in observer is never attached.
 *
 * It syncs the value both ways and re-applies it when options arrive later (e.g. games loaded after the
 * form) — watching only the select's direct children, so `<selectedcontent>` updates don't trigger it.
 */
@Directive({
  selector: 'select[formField]',
  host: {
    '(change)': 'onChange()',
    '(blur)': 'touch.emit()',
    '[disabled]': 'disabled()',
  },
})
export class SelectControl implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly touch = output<void>();

  private readonly select = inject<ElementRef<HTMLSelectElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterRenderEffect(() => this.apply(this.value()));

    afterNextRender(() => {
      if (typeof MutationObserver !== 'function') {
        return;
      }
      // Options rendered by @for after data loads: the model value may only now have a matching option.
      const observer = new MutationObserver(() => this.apply(this.value()));
      observer.observe(this.select, { childList: true });
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected onChange(): void {
    this.value.set(this.select.value);
  }

  private apply(value: string): void {
    if (this.select.value !== value) {
      this.select.value = value;
    }
  }
}
