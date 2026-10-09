import { Component, inject, input, output, signal } from '@angular/core';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { DirectMessageService } from '../../../services/direct-message/direct-message.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';

/** "Delete conversation" confirmation — hides the history on my side only. */
@Component({
  selector: 'app-clear-conversation-sheet',
  imports: [SheetModal],
  template: `
    <app-sheet-modal title="Delete conversation?" [subtitle]="'With @' + username()" (closed)="closed.emit()">
      <p class="cc-text">
        The messages disappear for you only — &#64;{{ username() }} still sees them. If either of you writes again,
        the conversation comes back with just the new messages.
      </p>
      @if (error(); as message) {
        <p class="cc-error" role="alert">{{ message }}</p>
      }
      <div class="cc-actions">
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="isDeleting()" (click)="confirm()">
          {{ isDeleting() ? 'Deleting…' : 'Delete for me' }}
        </button>
      </div>
    </app-sheet-modal>
  `,
  styles: `
    @use '../../../../styles/variables' as *;

    .cc-text {
      margin: 0 0 16px;
      color: $color-text-secondary;
      font-size: 14px;
      line-height: 1.5;
    }

    .cc-error {
      margin: 0 0 12px;
      color: $color-accent-light;
      font-size: 13px;
    }

    .cc-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  `,
})
export class ClearConversationSheet {
  private dms = inject(DirectMessageService);

  readonly conversationId = input.required<string>();
  readonly username = input.required<string>();
  readonly closed = output<void>();
  readonly cleared = output<void>();

  protected readonly isDeleting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected confirm(): void {
    this.isDeleting.set(true);
    this.error.set(null);
    this.dms.clear(this.conversationId()).subscribe({
      next: () => this.cleared.emit(),
      error: (err: unknown) => {
        this.isDeleting.set(false);
        this.error.set(extractApiErrorMessage(err, 'Could not delete the conversation.'));
      },
    });
  }
}
