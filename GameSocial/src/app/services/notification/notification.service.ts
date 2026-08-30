import { Service, signal } from '@angular/core';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const AUTO_DISMISS_MS = 5000;

let nextToastId = 0;

/** Signal-based toast list — mounted once in MainLayout as <app-toast-list>. */
@Service()
export class NotificationService {
  private toastsState = signal<Toast[]>([]);
  readonly toasts = this.toastsState.asReadonly();

  error(message: string): void {
    this.push('error', message);
  }

  success(message: string): void {
    this.push('success', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.toastsState.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private push(type: ToastType, message: string): void {
    const id = ++nextToastId;
    this.toastsState.update((toasts) => [...toasts, { id, type, message }]);
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
  }
}
