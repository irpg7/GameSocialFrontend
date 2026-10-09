import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, distinctUntilChanged, finalize, skip } from 'rxjs';
import { UserService } from '../../services/user/user.service';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { AdminUserModel } from '../../models/admin-user.model';
import { PERMISSION_KEYS, PermissionKey } from '../../constants/permissions';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { Pager } from '../../shared/pager/pager';
import { DatePipe } from '@angular/common';
import { BanSheet } from '../ban-sheet/ban-sheet';
import { ModerationService } from '../../services/moderation/moderation.service';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-users-admin',
  imports: [Pager, DatePipe, BanSheet],
  templateUrl: './users-admin.html',
  styleUrl: './users-admin.scss',
})
export class UsersAdmin implements OnInit {
  private userService = inject(UserService);
  protected readonly authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private moderationService = inject(ModerationService);

  protected readonly permissionKeys = PERMISSION_KEYS;

  /** One page of users (GET /api/users is paged); search matches username or email on the server. */
  protected readonly users = signal<AdminUserModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly searchQuery = signal('');
  protected readonly requestsOnly = signal(false);
  protected readonly bannedOnly = signal(false);
  /** Site-wide ban sheet (shared with Moderation). */
  protected readonly banTarget = signal<AdminUserModel | null>(null);
  protected readonly page = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = PAGE_SIZE;
  private loadRequest?: Subscription;
  private pendingKey = signal<string | null>(null);

  constructor() {
    toObservable(this.searchQuery)
      .pipe(skip(1), debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.load(1));
  }

  ngOnInit(): void {
    this.load(1);
  }

  protected goToPage(page: number): void {
    this.load(page);
  }

  protected toggleRequestsOnly(): void {
    this.requestsOnly.update((value) => !value);
    this.load(1);
  }

  protected toggleBannedOnly(): void {
    this.bannedOnly.update((value) => !value);
    this.load(1);
  }

  protected onBanned(): void {
    const user = this.banTarget();
    this.banTarget.set(null);
    this.notificationService.success(`Banned ${user?.username}. Their sessions were ended.`);
    this.load(this.page());
  }

  protected unban(user: AdminUserModel): void {
    const key = this.pendingKeyFor(user.id, 'ban');
    this.pendingKey.set(key);
    this.moderationService
      .unban(user.id, '')
      .pipe(finalize(() => this.pendingKey.set(null)))
      .subscribe({
        next: () => this.users.update((existing) => existing.map((u) => (u.id === user.id ? { ...u, isBanned: false, banEndsAt: null, banReason: null } : u))),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to unban the user.')),
      });
  }

  isCurrentUser(user: AdminUserModel): boolean {
    return user.id === this.authService.currentUser()?.id;
  }

  hasPermission(user: AdminUserModel, permission: PermissionKey): boolean {
    return user.permissions.includes(permission);
  }

  /** Developer approval — checking the box approves (and clears the request), unchecking revokes. */
  toggleDeveloper(user: AdminUserModel): void {
    this.setDeveloper(user, !user.isDeveloper);
  }

  declineDeveloper(user: AdminUserModel): void {
    this.setDeveloper(user, false);
  }

  private setDeveloper(user: AdminUserModel, isDeveloper: boolean): void {
    const key = this.pendingKeyFor(user.id, 'developer');
    this.pendingKey.set(key);
    this.userService
      .setDeveloper(user.id, isDeveloper)
      .pipe(finalize(() => this.pendingKey.set(null)))
      .subscribe({
        next: (updated) => this.users.update((existing) => existing.map((u) => (u.id === updated.id ? updated : u))),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to update developer status.')),
      });
  }

  isPending(user: AdminUserModel, permission: PermissionKey | 'developer' | 'ban'): boolean {
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

  private pendingKeyFor(userId: string, permission: PermissionKey | 'developer' | 'ban'): string {
    return `${userId}:${permission}`;
  }

  private load(page: number): void {
    this.loadRequest?.unsubscribe();
    this.isLoading.set(true);
    this.loadRequest = this.userService
      .list({
        search: this.searchQuery().trim() || undefined,
        developerRequestsOnly: this.requestsOnly(),
        bannedOnly: this.bannedOnly(),
        page,
        pageSize: PAGE_SIZE,
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.users.set(result.items);
          this.page.set(result.page);
          this.totalCount.set(result.totalCount);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to load users.')),
      });
  }
}
