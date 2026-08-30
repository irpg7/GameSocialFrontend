import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { PERMISSION_KEYS } from '../constants/permissions';

/** Allows entry to /backoffice if the user holds at least one backoffice permission. */
export const backofficeGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const knownPermissions: string[] = PERMISSION_KEYS;
  const hasAnyBackofficeAccess = authService.permissions().some((permission) => knownPermissions.includes(permission));

  if (hasAnyBackofficeAccess) {
    return true;
  }
  return router.createUrlTree(['/feed']);
};
