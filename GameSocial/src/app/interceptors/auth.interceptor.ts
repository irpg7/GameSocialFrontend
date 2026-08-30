import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth/auth.service';

// Login/register never carry a token, so they don't need the Authorization header.
const NO_AUTH_HEADER_PATHS = ['/api/auth/login', '/api/auth/register'];

// A 401 from any of these three is never a "session expired elsewhere" event —
// it's either bad credentials (login/register) or logout rejecting a token
// that's already invalid. Treating those as session-expiry used to make
// logout() call POST /api/auth/logout, get a 401 back, and call logout()
// again — an infinite loop that froze the tab and kept regenerating returnUrl.
const NO_FORCED_LOGOUT_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isApiRequest = req.url.startsWith('/api/');
  const skipAuthHeader = NO_AUTH_HEADER_PATHS.some((path) => req.url.startsWith(path));
  const skipForcedLogout = NO_FORCED_LOGOUT_PATHS.some((path) => req.url.startsWith(path));

  let authorizedReq = req;
  if (isApiRequest && !skipAuthHeader) {
    const token = authService.getToken();
    if (token) {
      authorizedReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
  }

  return next(authorizedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isApiRequest && !skipForcedLogout) {
        authService.logout();
        if (!router.url.startsWith('/login')) {
          router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        }
      }
      return throwError(() => error);
    }),
  );
};
