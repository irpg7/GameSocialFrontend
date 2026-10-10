import { Service, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Label of the confirming button. Default "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' paints the confirm button as a destructive action (delete, remove). */
  tone?: 'default' | 'danger';
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * The in-app replacement for `window.confirm()`: `await confirm.ask({...})` shows `ConfirmDialogHost` (mounted
 * once in the app root) and resolves true / false. Asking while one is open answers the open one "no" first.
 */
@Service()
export class ConfirmService {
  private readonly requestState = signal<ConfirmRequest | null>(null);
  /** The open question; null = closed. */
  readonly request = this.requestState.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    this.requestState()?.resolve(false);
    return new Promise<boolean>((resolve) => this.requestState.set({ ...options, resolve }));
  }

  answer(confirmed: boolean): void {
    const request = this.requestState();
    if (!request) {
      return;
    }
    this.requestState.set(null);
    request.resolve(confirmed);
  }
}
