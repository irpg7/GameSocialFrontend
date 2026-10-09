import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
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
    catchError(() => of(toLogin())),
  );
};
