import { Component, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { UserService } from '../../services/user/user.service';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { AdminUserModel } from '../../models/admin-user.model';
import { PERMISSION_KEYS, PermissionKey } from '../../constants/permissions';
import { extractApiErrorMessage } from '../../shared/api-error.util';

@Component({
  selector: 'app-users-admin',
  templateUrl: './users-admin.html',
  styleUrl: './users-admin.scss',
})
export class UsersAdmin implements OnInit {
  private userService = inject(UserService);
  protected readonly authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  protected readonly permissionKeys = PERMISSION_KEYS;

  protected readonly users = signal<AdminUserModel[]>([]);
  protected readonly isLoading = signal(true);
  private pendingKey = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  isCurrentUser(user: AdminUserModel): boolean {
    return user.id === this.authService.currentUser()?.id;
  }

  hasPermission(user: AdminUserModel, permission: PermissionKey): boolean {
    return user.permissions.includes(permission);
  }

  isPending(user: AdminUserModel, permission: PermissionKey): boolean {
    return this.pendingKey() === this.pendingKeyFor(user.id, permission);
  }

  /** Backend also rejects this with 400 — checkbox is disabled to avoid the round trip. */
  togglePermission(user: AdminUserModel, permission: PermissionKey): void {
    if (this.isCurrentUser(user)) {
      return;
    }

    const key = this.pendingKeyFor(user.id, permission);
    this.pendingKey.set(key);
    const hadPermission = this.hasPermission(user, permission);

    if (hadPermission) {
      this.userService
        .revokePermission(user.id, permission)
        .pipe(finalize(() => this.pendingKey.set(null)))
        .subscribe({
          next: () => this.updatePermissions(user.id, (permissions) => permissions.filter((p) => p !== permission)),
          error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to revoke permission.')),
        });
    } else {
      this.userService
        .grantPermission(user.id, permission)
        .pipe(finalize(() => this.pendingKey.set(null)))
        .subscribe({
          next: (updated) => this.users.update((existing) => existing.map((u) => (u.id === updated.id ? updated : u))),
          error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to grant permission.')),
        });
    }
  }

  private updatePermissions(userId: string, transform: (permissions: string[]) => string[]): void {
    this.users.update((existing) =>
      existing.map((user) => (user.id === userId ? { ...user, permissions: transform(user.permissions) } : user)),
    );
  }

  private pendingKeyFor(userId: string, permission: PermissionKey): string {
    return `${userId}:${permission}`;
  }

  private load(): void {
    this.isLoading.set(true);
    this.userService
      .list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (users) => this.users.set(users),
        error: () => this.notificationService.error('Failed to load users.'),
      });
  }
}
