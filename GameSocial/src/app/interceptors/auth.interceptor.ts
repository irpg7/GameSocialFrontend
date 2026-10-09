import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth/auth.service';
import { isSessionRejected } from '../models/auth.model';

// Anonymous account endpoints (email links, password reset): never a session matter.
const ANONYMOUS_ACCOUNT_PATHS = [
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

// Login/register/refresh never carry a token, so they don't need the Authorization header.
const NO_AUTH_HEADER_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', ...ANONYMOUS_ACCOUNT_PATHS];

// A 401 from any of these is never a "session expired elsewhere" event —
// it's either bad credentials (login/register), a dead refresh token (refresh) or
// logout rejecting a token that's already invalid. Treating those as session-expiry
// used to make logout() call POST /api/auth/logout, get a 401 back, and call logout()
// again — an infinite loop that froze the tab and kept regenerating returnUrl.
const NO_SESSION_HANDLING_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/refresh', ...ANONYMOUS_ACCOUNT_PATHS];

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Attaches the access token and keeps the session alive:
 * - an expired access token is renewed (refresh token) before the request goes out;
 * - a 401 triggers one refresh + retry; when the refresh is rejected too, the session ends
 *   and the user lands on /login with a returnUrl.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const isApiRequest = req.url.startsWith('/api/');
  if (!isApiRequest || NO_AUTH_HEADER_PATHS.some((path) => req.url.startsWith(path))) {
    return next(req);
  }
  const handlesSession = !NO_SESSION_HANDLING_PATHS.some((path) => req.url.startsWith(path));

  const refreshThenSend = () =>
    authService.refreshSession().pipe(
      catchError((refreshError: unknown) => {
        // A rejected refresh token (or a banned account) ends the session; a network failure leaves it for the next try.
        if (isSessionRejected(refreshError)) {
          authService.expireSession();
        }
        return throwError(() => refreshError);
      }),
      switchMap((token) => next(withToken(req, token))),
    );

  if (handlesSession && !authService.hasValidAccessToken() && authService.canRefresh()) {
    return refreshThenSend();
  }

  return next(withToken(req, authService.getToken())).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !handlesSession) {
        return throwError(() => error);
      }
      if (authService.canRefresh()) {
        return refreshThenSend();
      }
      authService.expireSession();
      return throwError(() => error);
    }),
  );
};
