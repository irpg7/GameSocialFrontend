import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { isSessionRejected } from '../models/auth.model';
import { AuthService } from '../services/auth/auth.service';

/**
 * Redirects unauthenticated users to /login, preserving the attempted URL. An expired access
 * token with a live refresh token is renewed first instead of bouncing the user to /login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toLogin = () => router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

  if (authService.hasValidAccessToken()) {
    return true;
  }
  if (!authService.canRefresh()) {
    return toLogin();
  }
  return authService.refreshSession().pipe(
    map(() => true),
    catchError((error: unknown) => {
      // Only a rejected refresh token ends the session. When the API is unreachable the session may still be
      // fine: let the page open and show its own load error. Sending the user to /login here looped, because
      // guestGuard still saw a usable refresh token and sent them straight back.
      if (isSessionRejected(error)) {
        authService.forgetSession();
        return of(toLogin());
      }
      return of(true);
    }),
  );
};
