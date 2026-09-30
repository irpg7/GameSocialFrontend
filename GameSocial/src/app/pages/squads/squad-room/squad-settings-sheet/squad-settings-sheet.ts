import { Component, OnInit, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { SquadHubService } from '../../../../services/squad/squad-hub.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import {
  JoinPolicyName,
  MAX_SQUAD_GAMES,
  SquadGameModel,
  SquadMemberModel,
  SquadModel,
  SquadRoleName,
} from '../../../../models/squad.model';
import { SquadGameOptionModel, SquadJoinRequestModel } from '../../../../models/squad-hub.model';
import { GameModel } from '../../../../models/game.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SquadSheetFrame } from '../../../../shared/squad-create-sheet/squad-sheet-frame';

type SettingsTab = 'general' | 'content' | 'members';
type RuleKey = 'allowMemberUploads' | 'requireSpoilerTag' | 'requireMemberApproval' | 'weeklyDigest';

interface PrivacyOption {
  value: JoinPolicyName;
  label: string;
  desc: string;
}

/** Turkish role labels — 07-squad-settings: Kurucu (fixed) / Yönetici / Üye. */
export const SQUAD_ROLE_LABELS: Record<SquadRoleName, string> = {
  Captain: 'Kurucu',
  Admin: 'Yönetici',
  Member: 'Üye',
};

const MAX_ICON_BYTES = 5 * 1024 * 1024;
const numberFormat = new Intl.NumberFormat('en-US');

/**
 * Squad settings — 07-squad-settings.html (`sqSettings`), 1:1: 600px sheet
 * with a 44px squad icon, three tabs (Genel / İçerik kuralları / Üyeler ve
 * roller), the searchable library game picker, the vertical "Katılım" radio
 * list, the content-rule switches, member rows with a cycling role pill and a
 * "···" menu, and a footer whose leave action becomes "Squad’ı devret ve
 * ayrıl" for the founder.
 *
 * Permissions mirror the server (Application/Features/Squads/Shared/SquadPermissions):
 * Kurucu + Yönetici edit settings, rules, invites and approve requests;
 * only the Kurucu changes roles or transfers; Yönetici can remove Üye only.
 */
@Component({
  selector: 'app-squad-settings-sheet',
  imports: [FormsModule, SquadSheetFrame],
  templateUrl: './squad-settings-sheet.html',
  styleUrl: './squad-settings-sheet.scss',
})
export class SquadSettingsSheet implements OnInit {
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);

  squad = input.required<SquadModel>();
  members = input.required<SquadMemberModel[]>();
  /** Kept for the room's binding; the picker now loads its own library-ranked list. */
  games = input<GameModel[]>([]);
  /** Legacy input — the sheet derives permissions from `squad().currentUserRole`. */
  isCaptain = input(false);
  currentUserId = input<string | undefined>(undefined);

  saved = output<SquadModel>();
  /** Membership changed (role/remove/approve/transfer) — the room should reload it. */
  membersChanged = output<void>();
  /** A new icon was uploaded (fires before save; the PUT response carries it too). */
  iconChanged = output<string>();
  /** The current user left; the room should navigate away. */
  left = output<void>();
  closed = output<void>();

  protected readonly maxGames = MAX_SQUAD_GAMES;
  protected readonly roleLabels = SQUAD_ROLE_LABELS;
  protected readonly tab = signal<SettingsTab>('general');
  protected readonly tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'Genel' },
    { key: 'content', label: 'İçerik kuralları' },
    { key: 'members', label: 'Üyeler ve roller' },
  ];

  protected readonly myRole = computed(() => this.squad().currentUserRole ?? null);
  protected readonly canManage = computed(() => this.myRole() === 'Captain' || this.myRole() === 'Admin');
  protected readonly isFounder = computed(() => this.myRole() === 'Captain');

  // Form state seeded from the squad, re-seeded when a different squad loads.
  protected readonly name = linkedSignal(() => this.squad().name);
  protected readonly joinPolicy = linkedSignal<JoinPolicyName>(() => this.squad().joinPolicy);
  protected readonly selectedGames = linkedSignal<SquadGameModel[]>(() => this.squad().games);
  protected readonly rules = linkedSignal<Record<RuleKey, boolean>>(() => ({
    allowMemberUploads: this.squad().allowMemberUploads,
    requireSpoilerTag: this.squad().requireSpoilerTag,
    requireMemberApproval: this.squad().requireMemberApproval,
    weeklyDigest: this.squad().weeklyDigest,
  }));
  protected readonly iconUrl = linkedSignal(() => this.squad().iconUrl ?? null);

  protected readonly ruleRows: { key: RuleKey; label: string; desc: string }[] = [
    { key: 'allowMemberUploads', label: 'Klip yüklemeyi herkese aç', desc: 'Kapalıysa sadece yönetici ve kurucu yükler' },
    { key: 'requireSpoilerTag', label: 'Spoiler etiketi zorunlu', desc: 'Ana hikâye içeriği bulanık gelir, tıklayınca açılır' },
    { key: 'requireMemberApproval', label: 'Yeni üyeyi onaydan geçir', desc: 'Davet linki ile gelenler önce beklemede durur' },
    { key: 'weeklyDigest', label: 'Haftalık squad özeti', desc: 'Pazar akşamı en iyi klipler ve tablo e-postayla gelir' },
  ];

  /** "Herkese açık" keeps an existing AskToJoin squad AskToJoin (approval-gated open). */
  protected readonly privacyOptions = computed<PrivacyOption[]>(() => [
    {
      value: this.squad().joinPolicy === 'AskToJoin' ? 'AskToJoin' : 'Open',
      label: 'Herkese açık',
      desc: 'Squad arama sonuçlarında görünür, isteyen katılır',
    },
    { value: 'InviteOnly', label: 'Davetle', desc: 'Sadece üyelerin gönderdiği link ile katılınır' },
    { value: 'Hidden', label: 'Gizli', desc: 'Aranamaz, sadece kurucunun onayıyla eklenir' },
  ]);

  // ─── Game picker ────────────────────────────────────────────────────────
  protected readonly isGamePickerOpen = signal(false);
  protected readonly gameQuery = signal('');
  protected readonly gameOptions = signal<SquadGameOptionModel[]>([]);
  protected readonly gameTotal = signal(0);
  protected readonly isLoadingGames = signal(false);

  protected readonly canAddGame = computed(() => this.selectedGames().length < MAX_SQUAD_GAMES);

  // ─── Members ────────────────────────────────────────────────────────────
  protected readonly activeMembers = computed(() => this.members().filter((m) => m.status !== 'Pending'));
  protected readonly joinRequests = signal<SquadJoinRequestModel[]>([]);
  protected readonly menuUserId = signal<string | null>(null);
  protected readonly busyUserId = signal<string | null>(null);
  protected readonly isInviteOpen = signal(false);
  protected readonly inviteUsername = signal('');
  protected readonly isInviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);

  // ─── Footer ─────────────────────────────────────────────────────────────
  protected readonly isSaving = signal(false);
  protected readonly isUploadingIcon = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly leaveStep = signal<'idle' | 'confirm'>('idle');
  protected readonly transferTargetId = signal<string | null>(null);
  protected readonly isLeaving = signal(false);

  protected readonly otherActiveMembers = computed(() =>
    this.activeMembers().filter((m) => m.userId !== this.currentUserId()),
  );

  protected readonly subtitle = computed(() => {
    const count = this.squad().memberCount;
    const role = this.myRole();
    const lead =
      role === 'Captain'
        ? 'Kurucu olarak sen yönetiyorsun'
        : role === 'Admin'
          ? 'Yönetici olarak sen yönetiyorsun'
          : 'Üye olarak görüntülüyorsun';
    return `${lead} · ${count} üye`;
  });

  protected readonly leaveLabel = computed(() => (this.isFounder() ? 'Squad’ı devret ve ayrıl' : 'Squad’dan ayrıl'));

  constructor() {
    toObservable(this.gameQuery)
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => {
          this.isLoadingGames.set(true);
          return this.hubService.getGameOptions(q.trim() || undefined).pipe(finalize(() => this.isLoadingGames.set(false)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (result) => {
          this.gameOptions.set(result.items);
          this.gameTotal.set(result.totalCount);
        },
        error: () => void 0,
      });
  }

  ngOnInit(): void {
    if (this.canManage()) {
      this.loadJoinRequests();
    }
  }

  // ─── General ────────────────────────────────────────────────────────────
  protected isGameSelected(gameId: number): boolean {
    return this.selectedGames().some((g) => g.id === gameId);
  }

  protected gameMeta(option: SquadGameOptionModel): string {
    if (option.kind === 'library') {
      return option.hoursPlayed ? `Kütüphanende · ${option.hoursPlayed} sa` : 'Kütüphanende';
    }
    if (option.kind === 'new') {
      return 'Yeni çıkan';
    }
    return `Popüler · ${compactCount(option.followerCount)} oyuncu`;
  }

  protected toggleGamePicker(): void {
    this.isGamePickerOpen.update((open) => !open);
    this.gameQuery.set('');
  }

  protected addGame(option: SquadGameOptionModel): void {
    if (this.isGameSelected(option.id) || !this.canAddGame()) {
      return;
    }
    this.selectedGames.update((games) => [...games, { id: option.id, name: option.name, coverImageUrl: option.coverImageUrl }]);
    this.gameQuery.set('');
  }

  protected removeGame(gameId: number): void {
    this.selectedGames.update((games) => games.filter((g) => g.id !== gameId));
  }

  protected suggestGame(): void {
    this.notificationService.info('Oyun önerisi henüz desteklenmiyor.');
  }

  protected onIconPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/') || file.size > MAX_ICON_BYTES) {
      this.errorMessage.set('Squad ikonu en fazla 5 MB boyutunda bir görsel olmalıdır.');
      return;
    }
    this.isUploadingIcon.set(true);
    this.hubService
      .uploadIcon(this.squad().id, file)
      .pipe(finalize(() => this.isUploadingIcon.set(false)))
      .subscribe({
        next: ({ iconUrl }) => {
          this.iconUrl.set(iconUrl);
          this.iconChanged.emit(iconUrl);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'İkon yüklenemedi.')),
      });
  }

  // ─── Content rules ──────────────────────────────────────────────────────
  protected toggleRule(key: RuleKey): void {
    if (!this.canManage()) {
      return;
    }
    this.rules.update((rules) => ({ ...rules, [key]: !rules[key] }));
  }

  // ─── Members ────────────────────────────────────────────────────────────
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
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Rol değiştirilemedi.')),
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
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Üye çıkarılamadı.')),
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
          this.saved.emit({ ...this.squad(), currentUserRole: 'Admin' });
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Squad devredilemedi.')),
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
        error: (err) => this.inviteError.set(extractApiErrorMessage(err, 'Davet gönderilemedi.')),
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
      error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'İstek işlenemedi.')),
    });
  }

  protected initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  // ─── Footer ─────────────────────────────────────────────────────────────
  protected save(): void {
    this.errorMessage.set(null);
    const name = this.name().trim();
    if (!name) {
      this.errorMessage.set('Squad adı zorunludur.');
      return;
    }
    const gameIds = this.selectedGames().map((g) => g.id);
    const squad = this.squad();
    // Banner game: keep the current one if it's still picked, otherwise the first chip.
    const primaryGameId = gameIds.includes(squad.primaryGameId ?? -1) ? squad.primaryGameId : gameIds[0];

    this.isSaving.set(true);
    this.squadService
      .update(squad.id, {
        name,
        // Not editable in this design — PUT is a full representation, so resend it.
        description: squad.description,
        joinPolicy: this.joinPolicy(),
        gameIds: gameIds.length > 0 ? gameIds : undefined,
        primaryGameId,
        ...this.rules(),
      })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => {
          this.notificationService.success('Değişiklikler kaydedildi.');
          this.saved.emit(updated);
        },
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Ayarlar kaydedilemedi.')),
      });
  }

  protected startLeave(): void {
    this.leaveStep.set('confirm');
    this.transferTargetId.set(this.otherActiveMembers()[0]?.userId ?? null);
  }

  protected cancelLeave(): void {
    this.leaveStep.set('idle');
  }

  protected confirmLeave(): void {
    if (this.isLeaving()) {
      return;
    }
    const squadId = this.squad().id;
    const target = this.transferTargetId();
    const mustTransfer = this.isFounder() && this.otherActiveMembers().length > 0;
    if (mustTransfer && !target) {
      return;
    }

    this.isLeaving.set(true);
    const leave = () =>
      this.squadService
        .leave(squadId)
        .pipe(finalize(() => this.isLeaving.set(false)))
        .subscribe({
          next: () => this.left.emit(),
          error: (err) => {
            this.leaveStep.set('idle');
            this.errorMessage.set(extractApiErrorMessage(err, 'Squad’dan ayrılamadın.'));
          },
        });

    if (mustTransfer && target) {
      this.hubService.transfer(squadId, target).subscribe({
        next: () => leave(),
        error: (err) => {
          this.isLeaving.set(false);
          this.errorMessage.set(extractApiErrorMessage(err, 'Squad devredilemedi.'));
        },
      });
    } else {
      leave();
    }
  }

  private loadJoinRequests(): void {
    this.hubService.listJoinRequests(this.squad().id).subscribe({
      next: (requests) => this.joinRequests.set(requests),
      error: () => void 0,
    });
  }
}

/** 84000 → "84k", 1200 → "1.2k". */
function compactCount(value: number): string {
  if (value >= 1_000_000) return `${trimZero(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimZero(value / 1_000)}k`;
  return String(value);
}

function trimZero(value: number): string {
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
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
