import { Component, inject } from '@angular/core';
import { BackdropClose } from '../overlay/backdrop-close';
import { DialogFocus } from '../overlay/dialog-focus';
import { ConfirmService } from './confirm.service';

/**
 * Renders `ConfirmService.request()` — a small alert dialog over everything (app and backoffice). Focus starts
 * on Cancel so Enter never confirms a destructive action by accident; Escape and the backdrop cancel.
 */
@Component({
  selector: 'app-confirm-dialog-host',
  imports: [BackdropClose, DialogFocus],
  template: `
    @if (confirm.request(); as request) {
      <div class="cd-backdrop" appBackdropClose (backdropClose)="confirm.answer(false)">
        <div
          class="cd-panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cd-title"
          aria-describedby="cd-message"
          appDialog
          dialogInitialFocus=".cd-cancel"
          (dialogEscape)="confirm.answer(false)">
          @if (request.tone === 'danger') {
            <span class="cd-icon" aria-hidden="true">!</span>
          }
          <h2 id="cd-title" class="cd-title">{{ request.title }}</h2>
          <p id="cd-message" class="cd-message">{{ request.message }}</p>
          <div class="cd-actions">
            <button type="button" class="btn btn-secondary cd-cancel" (click)="confirm.answer(false)">
              {{ request.cancelLabel ?? 'Cancel' }}
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="request.tone !== 'danger'"
              [class.cd-danger]="request.tone === 'danger'"
              (click)="confirm.answer(true)">
              {{ request.confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './confirm-dialog-host.scss',
})
export class ConfirmDialogHost {
  protected readonly confirm = inject(ConfirmService);
}
