import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VerifyEmailResponse } from '../../../models/auth.model';
import { AuthService } from '../../../services/auth/auth.service';
import { MeService } from '../../../services/me/me.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { AuthCard } from '../auth-card/auth-card';

/**
 * `/verify-email?token=…` — the link from the sign-up or email-change mail. Confirms on load. Works
 * signed in (email change from Settings) or signed out (new account → sign in, then onboarding).
 */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, AuthCard],
  templateUrl: './verify-email.html',
  styleUrl: '../auth-page.scss',
})
export class VerifyEmail {
  private auth = inject(AuthService);
  private me = inject(MeService);

  protected readonly result = signal<VerifyEmailResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly signedIn = this.auth.isAuthenticated();

  constructor() {
    const token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
    if (!token) {
      this.error.set('This link is incomplete. Open it again from the email.');
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      next: (result) => {
        this.result.set(result);
        if (this.signedIn) {
          this.me.patch({ email: result.email, pendingEmail: null });
        }
      },
      error: (err: unknown) =>
        this.error.set(extractApiErrorMessage(err, 'This link is invalid, already used or expired.')),
    });
  }
}
