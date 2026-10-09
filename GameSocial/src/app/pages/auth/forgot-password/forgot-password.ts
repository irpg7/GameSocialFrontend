import { Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth/auth.service';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';
import { AuthCard } from '../auth-card/auth-card';

/**
 * "Forgot password?" — asks for the address and always shows the same confirmation (the server never
 * says whether an account exists).
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, FormRoot, RouterLink, AuthCard],
  templateUrl: './forgot-password.html',
  styleUrl: '../auth-page.scss',
})
export class ForgotPassword {
  private auth = inject(AuthService);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ email: inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '' });
  protected readonly sentTo = signal<string | null>(null);

  protected readonly forgotForm = form(
    this.model,
    (path) => {
      required(path.email, { message: 'Enter a valid email address.' });
      email(path.email, { message: 'Enter a valid email address.' });
    },
    {
      submission: {
        action: async () => {
          const address = this.model().email.trim();
          try {
            await firstValueFrom(this.auth.forgotPassword(address));
          } catch (err) {
            return serverError(err, 'Could not send the email. Please try again.');
          }
          this.sentTo.set(address);
          return undefined;
        },
      },
    },
  );
}
