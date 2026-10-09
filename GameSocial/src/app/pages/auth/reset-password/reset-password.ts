import { Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, required, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth/auth.service';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';
import { passwordRules } from '../../../shared/password-rules';
import { AuthCard } from '../auth-card/auth-card';

/**
 * `/reset-password?token=…` — the link from the reset mail. The server signs out every session of the
 * account, so a session in this browser is dropped too before going to sign in.
 */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, FormRoot, RouterLink, AuthCard],
  templateUrl: './reset-password.html',
  styleUrl: '../auth-page.scss',
})
export class ResetPassword {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  private readonly model = signal({ password: '', confirm: '' });

  protected readonly resetForm = form(
    this.model,
    (path) => {
      passwordRules(path.password);
      required(path.confirm, { message: 'Repeat the new password.' });
      validate(path.confirm, ({ value, valueOf }) =>
        value() && value() !== valueOf(path.password) ? { kind: 'mismatch', message: 'The passwords do not match.' } : undefined,
      );
    },
    {
      submission: {
        action: async () => {
          try {
            await firstValueFrom(this.auth.resetPassword(this.token ?? '', this.model().password));
          } catch (err) {
            return serverError(err, 'This link is invalid, already used or expired.');
          }
          // Every session of the account ended on the server — don't keep a dead one here.
          this.auth.forgetSession();
          await this.router.navigate(['/login'], { queryParams: { notice: 'password-reset' } });
          return undefined;
        },
      },
    },
  );
}
