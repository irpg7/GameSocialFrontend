import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EMAIL_NOT_VERIFIED } from '../../models/auth.model';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { fieldError, serverError, submitError } from '../../shared/form-errors';
import { AuthCard } from '../auth/auth-card/auth-card';

@Component({
  imports: [FormField, FormRoot, RouterLink, AuthCard, DatePipe],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notifications = inject(NotificationService);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ email: this.route.snapshot.queryParamMap.get('email') ?? '', password: '' });

  /** The account exists and the password matched, but its email isn't verified yet — offer a new link. */
  protected readonly unverifiedEmail = signal<string | null>(null);
  protected readonly resendState = signal<'idle' | 'sending' | 'sent'>('idle');
  // Read live, not from the first snapshot: Angular reuses this page when /login is navigated to again with new
  // params (account deletion: the hub's sessionEnded lands here first, then the sheet adds notice + until).
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  /** "Your email is verified" / "password changed" notes when arriving from those pages. */
  protected readonly notice = computed(() => this.queryParams().get('notice'));
  /** `notice=deletion-scheduled`: when the account will be deleted (`until`, ISO). */
  protected readonly deletionDate = computed(() => this.queryParams().get('until'));

  protected readonly loginForm = form(
    this.model,
    (path) => {
      required(path.email, { message: 'Enter a valid email address.' });
      email(path.email, { message: 'Enter a valid email address.' });
      required(path.password, { message: 'Password is required.' });
    },
    {
      submission: {
        action: async () => {
          const { email: address, password } = this.model();
          this.unverifiedEmail.set(null);
          this.resendState.set('idle');
          try {
            const result = await firstValueFrom(this.authService.login(address, password));
            if (result.deletionCancelled) {
              this.notifications.success('Welcome back! Your account deletion was cancelled.');
            }
          } catch (err) {
            if (err instanceof HttpErrorResponse && err.status === 403 && err.error?.code === EMAIL_NOT_VERIFIED) {
              this.unverifiedEmail.set(address);
            }
            // The server's own message when it has one (wrong credentials, too many attempts, …).
            return serverError(err, 'Invalid email or password.');
          }
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          await this.router.navigateByUrl(returnUrl || '/feed');
          return undefined;
        },
      },
    },
  );

  protected resendVerification(): void {
    const address = this.unverifiedEmail();
    if (!address || this.resendState() !== 'idle') {
      return;
    }
    this.resendState.set('sending');
    this.authService.resendVerification(address).subscribe({
      next: () => this.resendState.set('sent'),
      // Rate limited or offline: let the user try again.
      error: () => this.resendState.set('idle'),
    });
  }
}
