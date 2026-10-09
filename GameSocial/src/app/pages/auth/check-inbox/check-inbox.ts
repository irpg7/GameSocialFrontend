import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { AuthCard } from '../auth-card/auth-card';

/** Seconds before "Resend" works again — matches the server's per-address cooldown. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * After sign-up: "we sent a link to …". The account can't sign in until that link is opened, so the
 * page offers a resend (cooldown-limited, like the server).
 */
@Component({
  selector: 'app-check-inbox',
  imports: [RouterLink, AuthCard],
  templateUrl: './check-inbox.html',
  styleUrl: '../auth-page.scss',
})
export class CheckInbox {
  private auth = inject(AuthService);

  protected readonly email = inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '';

  protected readonly cooldown = signal(RESEND_COOLDOWN_SECONDS);
  protected readonly sending = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly canResend = computed(() => !!this.email && !this.sending() && this.cooldown() === 0);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCooldown();
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  protected resend(): void {
    if (!this.canResend()) {
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.sending.set(false);
        this.status.set('We sent a new link. It may take a minute to arrive.');
        this.startCooldown();
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.error.set(extractApiErrorMessage(err, 'Could not send the email. Please try again.'));
      },
    });
  }

  private startCooldown(): void {
    this.stopTimer();
    this.cooldown.set(RESEND_COOLDOWN_SECONDS);
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(Math.max(next, 0));
      if (next <= 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
