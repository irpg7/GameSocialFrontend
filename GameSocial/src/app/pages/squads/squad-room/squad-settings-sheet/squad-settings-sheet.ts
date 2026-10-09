import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, disabled, form, maxLength } from '@angular/forms/signals';
import { SelectControl } from '../../../../shared/select-control';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { SquadHubService } from '../../../../services/squad/squad-hub.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { JoinPolicyName, SquadGameModel, SquadMemberModel, SquadModel } from '../../../../models/squad.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SquadSheetFrame } from '../../../../shared/squad-create-sheet/squad-sheet-frame';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { SettingsGamesPicker } from './settings-games-picker/settings-games-picker';
import { SettingsMembersTab } from './settings-members-tab/settings-members-tab';

type SettingsTab = 'general' | 'content' | 'members';
type RuleKey = 'allowMemberUploads' | 'requireSpoilerTag' | 'requireMemberApproval' | 'weeklyDigest';

interface PrivacyOption {
  value: JoinPolicyName;
  label: string;
  desc: string;
}

const MAX_ICON_BYTES = 5 * 1024 * 1024;

/**
 * Squad settings — 07-squad-settings.html (`sqSettings`), 1:1: 600px sheet
 * with a 44px squad icon, three tabs (Genel / İçerik kuralları / Üyeler ve
 * roller), the vertical "Katılım" radio list, the content-rule switches and a
 * footer whose leave action becomes "Squad’ı devret ve ayrıl" for the founder.
 * The game picker (`settings-games-picker`) and the members tab
 * (`settings-members-tab`) are their own components.
 *
 * Permissions mirror the server (Application/Features/Squads/Shared/SquadPermissions):
 * Kurucu + Yönetici edit settings, rules, invites and approve requests;
 * only the Kurucu changes roles or transfers; Yönetici can remove Üye only.
 */
@Component({
  selector: 'app-squad-settings-sheet',
  imports: [ImgFallback, FormField, SelectControl, SquadSheetFrame, SettingsGamesPicker, SettingsMembersTab],
  templateUrl: './squad-settings-sheet.html',
  styleUrl: './squad-settings-sheet.scss',
})
export class SquadSettingsSheet {
  private squadService = inject(SquadService);
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);

  squad = input.required<SquadModel>();
  members = input.required<SquadMemberModel[]>();
  /** Kept for the room's binding; the picker now loads its own library-ranked list. */
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
  // "Genel" tab: name + join policy as one Signal Form; only founders/admins may edit them.
  private readonly generalModel = linkedSignal(() => ({
    name: this.squad().name,
    joinPolicy: this.squad().joinPolicy as JoinPolicyName,
  }));
  protected readonly generalForm = form(this.generalModel, (path) => {
    maxLength(path.name, 100);
    disabled(path.name, { when: () => !this.canManage() });
    disabled(path.joinPolicy, { when: () => !this.canManage() });
  });
  protected readonly name = computed(() => this.generalModel().name);
  protected readonly joinPolicy = computed(() => this.generalModel().joinPolicy);
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

  // ─── Footer ─────────────────────────────────────────────────────────────
  protected readonly isSaving = signal(false);
  protected readonly isUploadingIcon = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly leaveStep = signal<'idle' | 'confirm'>('idle');
  /** New founder when the captain leaves; '' = none picked. */
  protected readonly transferTargetId = signal('');
  protected readonly transferField = form(this.transferTargetId);
  protected readonly isLeaving = signal(false);

  protected readonly otherActiveMembers = computed(() =>
    this.members().filter((m) => m.status !== 'Pending' && m.userId !== this.currentUserId()),
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

  // ─── General ────────────────────────────────────────────────────────────
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
        error: (err: unknown) => this.errorMessage.set(extractApiErrorMessage(err, 'İkon yüklenemedi.')),
      });
  }

  // ─── Content rules ──────────────────────────────────────────────────────
  protected toggleRule(key: RuleKey): void {
    if (!this.canManage()) {
      return;
    }
    this.rules.update((rules) => ({ ...rules, [key]: !rules[key] }));
  }

  /** "Kurucu yap" in the members tab: you are Yönetici now. */
  protected onTransferred(): void {
    this.saved.emit({ ...this.squad(), currentUserRole: 'Admin' });
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
        error: (err: unknown) => this.errorMessage.set(extractApiErrorMessage(err, 'Ayarlar kaydedilemedi.')),
      });
  }

  protected startLeave(): void {
    this.leaveStep.set('confirm');
    this.transferTargetId.set(this.otherActiveMembers()[0]?.userId ?? '');
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
          error: (err: unknown) => {
            this.leaveStep.set('idle');
            this.errorMessage.set(extractApiErrorMessage(err, 'Squad’dan ayrılamadın.'));
          },
        });

    if (mustTransfer && target) {
      this.hubService.transfer(squadId, target).subscribe({
        next: () => leave(),
        error: (err: unknown) => {
          this.isLeaving.set(false);
          this.errorMessage.set(extractApiErrorMessage(err, 'Squad devredilemedi.'));
        },
      });
    } else {
      leave();
    }
  }
}
