import { Component, input, output } from '@angular/core';

type Wrap = { before: string; after: string; placeholder: string };

/**
 * The design's formatting strip (Write a review / New DevLog sheets):
 * B · I · U | • · ❝ · 🔗 · ▨ Spoiler, then any projected extra buttons
 * (e.g. "▶ Embed clip") and an optional right-aligned hint.
 *
 * Works on a plain <textarea>: pass the element as `target`; every action
 * rewrites its value in rich-text-format syntax and emits the new value via
 * `changed` so the owning form/signal stays the source of truth.
 *
 *   <app-rich-text-toolbar [target]="bodyEl" (changed)="body.set($event)" hint="Bold, italic, quotes, spoiler blocks">
 *     <button type="button" class="rt-tool rt-tool-wide">▶ Embed clip</button>
 *   </app-rich-text-toolbar>
 *   <textarea #bodyEl …></textarea>
 */
@Component({
  selector: 'app-rich-text-toolbar',
  templateUrl: './rich-text-toolbar.html',
  styleUrl: './rich-text-toolbar.scss',
  host: { role: 'toolbar', 'aria-label': 'Metin biçimlendirme' },
})
export class RichTextToolbar {
  readonly target = input.required<HTMLTextAreaElement>();
  readonly hint = input<string>('');
  readonly changed = output<string>();

  protected bold(): void {
    this.wrap({ before: '**', after: '**', placeholder: 'kalın' });
  }

  protected italic(): void {
    this.wrap({ before: '*', after: '*', placeholder: 'italik' });
  }

  protected underline(): void {
    this.wrap({ before: '__', after: '__', placeholder: 'altı çizili' });
  }

  protected spoiler(): void {
    this.wrap({ before: '||', after: '||', placeholder: 'spoiler' });
  }

  protected bullet(): void {
    this.prefixLines('- ');
  }

  protected quote(): void {
    this.prefixLines('> ');
  }

  protected link(): void {
    const el = this.target();
    const selected = el.value.slice(el.selectionStart, el.selectionEnd) || 'bağlantı';
    this.replaceSelection(`[${selected}](https://)`, selected.length + 3, selected.length + 11);
  }

  private wrap({ before, after, placeholder }: Wrap): void {
    const el = this.target();
    const selected = el.value.slice(el.selectionStart, el.selectionEnd) || placeholder;
    this.replaceSelection(before + selected + after, before.length, before.length + selected.length);
  }

  private prefixLines(prefix: string): void {
    const el = this.target();
    const value = el.value;
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const endIdx = value.indexOf('\n', el.selectionEnd);
    const end = endIdx === -1 ? value.length : endIdx;
    const block = value
      .slice(start, end)
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n');
    el.setSelectionRange(start, end);
    this.replaceSelection(block, block.length, block.length);
  }

  /** Replaces the current selection and re-selects [selStart, selEnd) relative to the insert point. */
  private replaceSelection(text: string, selStart: number, selEnd: number): void {
    const el = this.target();
    const from = el.selectionStart;
    const to = el.selectionEnd;
    el.value = el.value.slice(0, from) + text + el.value.slice(to);
    el.focus();
    el.setSelectionRange(from + selStart, from + selEnd);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.changed.emit(el.value);
  }
}
