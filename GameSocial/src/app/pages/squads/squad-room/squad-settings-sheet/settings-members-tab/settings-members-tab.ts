import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../../services/squad/squad.service';
import { SquadHubService } from '../../../../../services/squad/squad-hub.service';
import { NotificationService } from '../../../../../services/notification/notification.service';
import { SquadMemberModel, SquadModel, SquadRoleName } from '../../../../../models/squad.model';
import { SquadJoinRequestModel } from '../../../../../models/squad-hub.model';
import { SquadBanModel } from '../../../../../models/squad-ban.model';
import { extractApiErrorMessage } from '../../../../../shared/api-error.util';
import { ImgFallback } from '../../../../../shared/img-fallback/img-fallback';
import { SQUAD_ROLE_LABELS } from '../squad-role-labels';

const numberFormat = new Intl.NumberFormat('en-US');

/**
 * Settings → "Üyeler ve roller" (07-squad-settings.html): pending join requests, member rows with a
 * cycling role pill and a "···" menu, the ban list and the invite row. Every action applies right
 * away (no Save). Permissions mirror the server (Squads/Shared/SquadPermissions): Kurucu + Yönetici
 * approve, ban and invite; only the Kurucu changes roles or transfers; Yönetici can remove Üye only.
 */
@Component({
  selector: 'app-settings-members-tab',
  imports: [FormField, ImgFallback],
  templateUrl: './settings-members-tab.html',
  styleUrl: './settings-members-tab.scss',
})
export class SettingsMembersTab implements OnInit {
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);

  squad = input.required<SquadModel>();
  members = input.required<SquadMemberModel[]>();
  currentUserId = input<string | undefined>(undefined);
  /** Membership changed (role/remove/approve/ban/transfer) — the room should reload it. */
  membersChanged = output<void>();
  /** You handed the squad to someone else and are now Yönetici. */
  transferred = output<void>();

  protected readonly roleLabels = SQUAD_ROLE_LABELS;
  private readonly myRole = computed(() => this.squad().currentUserRole ?? null);
  protected readonly canManage = computed(() => this.myRole() === 'Captain' || this.myRole() === 'Admin');
  protected readonly isFounder = computed(() => this.myRole() === 'Captain');
  protected readonly activeMembers = computed(() => this.members().filter((m) => m.status !== 'Pending'));

  protected readonly joinRequests = signal<SquadJoinRequestModel[]>([]);
  /** Kara liste — yasaklılar katılamaz, istek gönderemez, davet edilemez. */
  protected readonly bans = signal<SquadBanModel[]>([]);
  protected readonly menuUserId = signal<string | null>(null);
  protected readonly busyUserId = signal<string | null>(null);
  protected readonly isInviteOpen = signal(false);
  private readonly inviteUsername = signal('');
  protected readonly inviteField = form(this.inviteUsername);
  protected readonly isInviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);

  ngOnInit(): void {
    if (this.canManage()) {
      this.loadJoinRequests();
      this.loadBans();
    }
  }

  protected isSelf(userId: string): boolean {
    return userId === this.currentUserId();
  }

  protected memberMeta(member: SquadMemberModel): string {
    const points = `${numberFormat.format(member.xp ?? 0)} puan`;
    if (this.isSelf(member.userId)) {
      return `${SQUAD_ROLE_LABELS[member.role]} · ${points}`;
    }
    if (member.presence === 'online' || member.presence === 'dnd') {
      return `${member.currentActivity ? 'Oyunda' : 'Çevrimiçi'} · ${points}`;
    }
    if (member.lastSeenAt) {
      return `${relativeTr(member.lastSeenAt)} · ${points}`;
    }
    return points;
  }

  /** The pill cycles Üye ↔ Yönetici; Kurucu is fixed. Only the founder changes roles. */
  protected canCycleRole(member: SquadMemberModel): boolean {
    return this.isFounder() && member.role !== 'Captain';
  }

  protected canRemove(member: SquadMemberModel): boolean {
    if (this.isSelf(member.userId) || member.role === 'Captain') {
      return false;
    }
    return this.isFounder() || (this.myRole() === 'Admin' && member.role === 'Member');
  }

  protected hasMenu(member: SquadMemberModel): boolean {
    return this.canRemove(member) || (this.isFounder() && !this.isSelf(member.userId));
  }

  protected toggleMenu(userId: string): void {
    this.menuUserId.update((current) => (current === userId ? null : userId));
  }

  protected cycleRole(member: SquadMemberModel): void {
    if (!this.canCycleRole(member) || this.busyUserId()) {
      return;
    }
    const next: SquadRoleName = member.role === 'Admin' ? 'Member' : 'Admin';
    this.busyUserId.set(member.userId);
    this.squadService
      .changeMemberRole(this.squad().id, member.userId, next)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => this.membersChanged.emit(),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Rol değiştirilemedi.')),
      });
  }

  protected removeMember(member: SquadMemberModel): void {
    this.menuUserId.set(null);
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(member.userId);
    this.squadService
      .removeMember(this.squad().id, member.userId)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => this.membersChanged.emit(),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Üye çıkarılamadı.')),
      });
  }

  /** "Yasakla" — üyeyi ya da bekleyen isteği kara listeye alır; tekrar katılamaz. */
  protected banUser(userId: string, username: string): void {
    this.menuUserId.set(null);
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(userId);
    this.hubService
      .banUser(this.squad().id, userId)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: (ban) => {
          this.bans.update((list) => [ban, ...list.filter((b) => b.userId !== ban.userId)]);
          this.joinRequests.update((list) => list.filter((r) => r.userId !== userId));
          this.notificationService.success(`${username} yasaklandı.`);
          this.membersChanged.emit();
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Kullanıcı yasaklanamadı.')),
      });
  }

  protected unban(ban: SquadBanModel): void {
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(ban.userId);
    this.hubService
      .unbanUser(this.squad().id, ban.userId)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => this.bans.update((list) => list.filter((b) => b.userId !== ban.userId)),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Yasak kaldırılamadı.')),
      });
  }

  /** "Kurucu yap" — transfers the squad; you become Yönetici. */
  protected makeFounder(member: SquadMemberModel): void {
    this.menuUserId.set(null);
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(member.userId);
    this.hubService
      .transfer(this.squad().id, member.userId)
      .pipe(finalize(() => this.busyUserId.set(null)))
      .subscribe({
        next: () => {
          this.notificationService.success(`${member.username} artık kurucu.`);
          this.membersChanged.emit();
          this.transferred.emit();
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Squad devredilemedi.')),
      });
  }

  protected openInvite(): void {
    this.isInviteOpen.set(true);
    this.inviteError.set(null);
  }

  protected invite(): void {
    const username = this.inviteUsername().trim().replace(/^@/, '');
    if (!username || this.isInviting()) {
      return;
    }
    this.inviteError.set(null);
    this.isInviting.set(true);
    this.hubService
      .invite(this.squad().id, username)
      .pipe(finalize(() => this.isInviting.set(false)))
      .subscribe({
        next: () => {
          this.notificationService.success(`${username} davet edildi.`);
          this.inviteUsername.set('');
        },
        error: (err: unknown) => this.inviteError.set(extractApiErrorMessage(err, 'Davet gönderilemedi.')),
      });
  }

  protected decideRequest(request: SquadJoinRequestModel, approve: boolean): void {
    if (this.busyUserId()) {
      return;
    }
    this.busyUserId.set(request.userId);
    const call = approve
      ? this.hubService.approveJoinRequest(this.squad().id, request.userId)
      : this.hubService.declineJoinRequest(this.squad().id, request.userId);
    call.pipe(finalize(() => this.busyUserId.set(null))).subscribe({
      next: () => {
        this.joinRequests.update((list) => list.filter((r) => r.userId !== request.userId));
        if (approve) {
          this.membersChanged.emit();
        }
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'İstek işlenemedi.')),
    });
  }

  private loadBans(): void {
    this.hubService.listBans(this.squad().id).subscribe({
      next: (bans) => this.bans.set(bans),
      error: (err: unknown) =>
        this.notificationService.error(extractApiErrorMessage(err, 'Yasaklılar listesi yüklenemedi.')),
    });
  }

  private loadJoinRequests(): void {
    this.hubService.listJoinRequests(this.squad().id).subscribe({
      next: (requests) => this.joinRequests.set(requests),
      error: (err: unknown) =>
        this.notificationService.error(extractApiErrorMessage(err, 'Katılma istekleri yüklenemedi.')),
    });
  }
}

/** "2 dk önce", "5 sa önce", "3 gün önce". */
function relativeTr(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}
