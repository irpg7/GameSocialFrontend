import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

/**
 * Matches only for signed-out visitors, so a route can have a public variant ahead of the signed-in one:
 * `/posts/:id` shows the read-only preview to visitors and falls through to the full page in the app otherwise.
 */
export const anonymousMatch: CanMatchFn = () => !inject(AuthService).isAuthenticated();
