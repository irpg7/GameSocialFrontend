import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { BACKOFFICE_SECTIONS, PermissionKey } from '../constants/permissions';

/**
 * Guards a single backoffice section behind a specific permission.
 *
 * Deviation from the plan's literal "redirect to /backoffice on failure":
 * '/backoffice' itself redirects straight to the 'games' child route, so
 * redirecting there for a user who lacks Game.Manage (but holds e.g. only
 * Settings.Manage) would bounce right back into this same guard failing
 * again — an infinite redirect loop. Redirecting to the first section the
 * user actually has access to preserves the plan's intent (send them
 * somewhere useful inside the backoffice) without that loop.
 */
export function permissionGuard(permission: PermissionKey): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.permissions().includes(permission)) {
      return true;
    }

    const fallback = BACKOFFICE_SECTIONS.find((section) => authService.permissions().includes(section.permission));
    return router.createUrlTree(fallback ? ['/backoffice', fallback.path] : ['/feed']);
  };
}
