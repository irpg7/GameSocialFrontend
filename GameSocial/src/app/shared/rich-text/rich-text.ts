import { Component, computed, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RichInline, parseRichText } from './rich-text-format';

/**
 * Renders a rich-text-format body (see rich-text-format.ts) as real DOM — no
 * innerHTML. Spoilers render as the design's "▨ spoiler hidden — …" chip and
 * reveal on click / Enter.
 */
@Component({
  selector: 'app-rich-text',
  imports: [NgTemplateOutlet],
  templateUrl: './rich-text.html',
  styleUrl: './rich-text.scss',
})
export class RichText {
  readonly text = input<string | null | undefined>('');

  protected readonly blocks = computed(() => parseRichText(this.text()));
  private readonly revealed = signal<ReadonlySet<number>>(new Set());

  protected isRevealed(id: number): boolean {
    return this.revealed().has(id);
  }

  protected reveal(id: number): void {
    this.revealed.update((s) => new Set(s).add(id));
  }

  protected asChildren(node: RichInline): RichInline[] {
    return 'children' in node ? node.children : [];
  }
}
