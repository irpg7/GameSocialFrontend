import { Component, computed, input, output } from '@angular/core';

/** "‹ Prev · Page 2 of 7 · 160 items · Next ›" under a paged table (backoffice lists). */
@Component({
  selector: 'app-pager',
  template: `
    @if (totalCount() > 0) {
      <nav class="pager" aria-label="Pagination">
        <button type="button" class="btn btn-sm btn-secondary" [disabled]="page() <= 1 || disabled()" (click)="pageChange.emit(page() - 1)">‹ Prev</button>
        <span class="pager-status">Page {{ page() }} of {{ pageCount() }} · {{ totalCount() }} {{ itemLabel() }}</span>
        <button type="button" class="btn btn-sm btn-secondary" [disabled]="page() >= pageCount() || disabled()" (click)="pageChange.emit(page() + 1)">Next ›</button>
      </nav>
    }
  `,
  styleUrl: './pager.scss',
})
export class Pager {
  page = input.required<number>();
  pageSize = input.required<number>();
  totalCount = input.required<number>();
  itemLabel = input('items');
  disabled = input(false);
  pageChange = output<number>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
}
