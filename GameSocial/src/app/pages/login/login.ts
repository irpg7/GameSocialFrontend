import { Component, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { SERVER_ERROR, fieldError, submitError } from '../../shared/form-errors';

@Component({
  imports: [FormField, FormRoot, RouterLink, NgOptimizedImage],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ email: '', password: '' });

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
          try {
            await firstValueFrom(this.authService.login(address, password));
          } catch {
            return { kind: SERVER_ERROR, message: 'Invalid email or password.' };
          }
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          await this.router.navigateByUrl(returnUrl || '/feed');
          return undefined;
        },
      },
    },
  );
}
