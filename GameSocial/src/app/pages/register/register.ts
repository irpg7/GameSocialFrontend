import { Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, minLength, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { fieldError, serverError, submitError } from '../../shared/form-errors';

@Component({
  imports: [FormField, FormRoot, RouterLink],
  selector: 'app-register',
  styleUrl: './register.scss',
  templateUrl: './register.html',
})
export class Register {
  private authService = inject(AuthService);
  private router = inject(Router);

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ username: '', email: '', password: '', requestDeveloper: false });

  protected readonly registerForm = form(
    this.model,
    (path) => {
      required(path.username, { message: 'Username must be at least 3 characters.' });
      minLength(path.username, 3, { message: 'Username must be at least 3 characters.' });
      required(path.email, { message: 'Enter a valid email address.' });
      email(path.email, { message: 'Enter a valid email address.' });
      required(path.password, { message: 'Password must be at least 8 characters.' });
      minLength(path.password, 8, { message: 'Password must be at least 8 characters.' });
    },
    {
      submission: {
        action: async () => {
          const { username, email: address, password, requestDeveloper } = this.model();
          try {
            await firstValueFrom(this.authService.register(username, address, password, requestDeveloper));
          } catch (err) {
            // The server's own message when it has one ("That email or username is already taken.").
            return serverError(err, 'Registration failed. Please check your details and try again.');
          }
          await this.router.navigateByUrl('/onboarding');
          return undefined;
        },
      },
    },
  );
}
