import { Component, input, output } from '@angular/core';

/**
 * "Could not load …" card with a Try again button — shown in place of a list or page whose request
 * failed, so a failure never looks like an empty result.
 */
@Component({
  selector: 'app-load-error',
  template: `
    <div class="card load-error" role="alert">
      <p>{{ message() }}</p>
      <button type="button" class="btn btn-secondary" (click)="retry.emit()">Try again</button>
    </div>
  `,
  styles: `
    @use '../../../styles/variables' as *;

    .load-error {
      display: flex;
      align-items: center;
      gap: 12px;

      p {
        margin: 0;
        flex: 1;
        color: $color-text-secondary;
      }
    }
  `,
})
export class LoadError {
  message = input.required<string>();
  retry = output<void>();
}
