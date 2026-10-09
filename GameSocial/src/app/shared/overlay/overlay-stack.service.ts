import { Service, signal } from '@angular/core';

/**
 * Open dialogs/sheets, oldest first. Escape closes only the top-most one, and page-level
 * Escape handlers (drawers, menus) stand down while any dialog is open.
 */
@Service()
export class OverlayStack {
  private readonly entries = signal<readonly object[]>([]);

  readonly hasOpen = () => this.entries().length > 0;

  push(entry: object): void {
    this.entries.update((list) => [...list, entry]);
  }

  remove(entry: object): void {
    this.entries.update((list) => list.filter((item) => item !== entry));
  }

  isTop(entry: object): boolean {
    const list = this.entries();
    return list[list.length - 1] === entry;
  }
}
