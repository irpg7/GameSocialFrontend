import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import {
  ModerationQueueItem,
  REPORT_REASONS,
  ReportReason,
  ReportTargetType,
} from '../../models/moderation.model';
import { ModerationService } from '../../services/moderation/moderation.service';
import { NotificationService } from '../../services/notification/notification.service';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { Pager } from '../../shared/pager/pager';
import { BanSheet } from '../ban-sheet/ban-sheet';

const PAGE_SIZE = 20;

const TYPE_FILTERS: { value: ReportTargetType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Post', label: 'Posts' },
  { value: 'Comment', label: 'Comments' },
  { value: 'User', label: 'Users' },
  { value: 'SquadMessage', label: 'Squad messages' },
  { value: 'Squad', label: 'Squads' },
  { value: 'DirectMessage', label: 'Direct messages' },
];

const ACTION_LABELS: Record<string, string> = {
  Dismiss: 'Dismissed',
  RemoveContent: 'Removed',
  RestoreContent: 'Restored',
  BanUser: 'Banned author',
  UnbanUser: 'Unbanned',
  AutoHide: 'Auto-hidden',
};

type PendingAction = 'dismiss' | 'remove' | 'restore';

/**
 * Backoffice → Moderation (Moderation.Manage). Reports grouped by target: count, reasons, latest note, a
 * preview (removed content stays visible here) and the target's action history. Remove needs a reason and
 * can be undone (Restore); Ban opens the shared ban sheet.
 */
@Component({
  selector: 'app-moderation-admin',
  imports: [DatePipe, RouterLink, Pager, BanSheet],
  templateUrl: './moderation-admin.html',
  styleUrl: './moderation-admin.scss',
})
export class ModerationAdmin implements OnInit {
  private moderation = inject(ModerationService);
  private notifications = inject(NotificationService);

  protected readonly typeFilters = TYPE_FILTERS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly status = signal<'Open' | 'Closed'>('Open');
  protected readonly type = signal<ReportTargetType | ''>('');
  protected readonly items = signal<ModerationQueueItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly page = signal(1);
  protected readonly totalCount = signal(0);

  /** Which item has its reason box open, and for what. */
  protected readonly acting = signal<{ key: string; action: PendingAction } | null>(null);
  protected readonly reason = signal('');
  protected readonly busyKey = signal<string | null>(null);
  protected readonly banTarget = signal<ModerationQueueItem | null>(null);
  protected readonly expandedHistory = signal<ReadonlySet<string>>(new Set());

  private loadRequest?: Subscription;

  ngOnInit(): void {
    this.load(1);
  }

  protected key(item: ModerationQueueItem): string {
    return `${item.targetType}:${item.targetId}`;
  }

  protected setStatus(status: 'Open' | 'Closed'): void {
    this.status.set(status);
    this.load(1);
  }

  protected setType(type: ReportTargetType | ''): void {
    this.type.set(type);
    this.load(1);
  }

  protected goToPage(page: number): void {
    this.load(page);
  }

  protected reasonLabel(reason: ReportReason): string {
    return REPORT_REASONS.find((r) => r.key === reason)?.label ?? reason;
  }

  protected actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  protected typeLabel(type: ReportTargetType): string {
    return type === 'SquadMessage' ? 'Squad message' : type === 'DirectMessage' ? 'Direct message' : type;
  }

  /** Where the target lives in the app (posts open on the author's profile; squads/messages in the room). */
  protected link(item: ModerationQueueItem): string[] | null {
    const p = item.preview;
    if (item.targetType === 'User' && p.authorId) return ['/profile', p.authorId];
    if (p.squadId && (item.targetType === 'Squad' || item.targetType === 'SquadMessage')) return ['/squads', p.squadId];
    if (p.postType === 'Clip' && p.postId) return ['/clips', p.postId];
    if (p.authorId && (item.targetType === 'Post' || item.targetType === 'Comment')) return ['/profile', p.authorId];
    return null;
  }

  protected canRemove(item: ModerationQueueItem): boolean {
    return item.targetType !== 'User' && item.preview.exists && !item.preview.isRemoved;
  }

  protected canRestore(item: ModerationQueueItem): boolean {
    return item.targetType !== 'User' && item.preview.isRemoved;
  }

  protected toggleHistory(item: ModerationQueueItem): void {
    const key = this.key(item);
    this.expandedHistory.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected startAction(item: ModerationQueueItem, action: PendingAction): void {
    this.acting.set({ key: this.key(item), action });
    this.reason.set('');
  }

  protected cancelAction(): void {
    this.acting.set(null);
  }

  protected confirmAction(item: ModerationQueueItem): void {
    const pending = this.acting();
    if (!pending || this.busyKey()) {
      return;
    }
    const reason = this.reason().trim();
    if (pending.action === 'remove' && !reason) {
      this.notifications.error('Enter a reason for removing it.');
      return;
    }
    const request =
      pending.action === 'dismiss'
        ? this.moderation.dismiss(item.targetType, item.targetId, reason)
        : pending.action === 'remove'
          ? this.moderation.remove(item.targetType, item.targetId, reason)
          : this.moderation.restore(item.targetType, item.targetId, reason);
    this.busyKey.set(pending.key);
    request.pipe(finalize(() => this.busyKey.set(null))).subscribe({
      next: () => {
        this.acting.set(null);
        this.notifications.success(
          pending.action === 'dismiss' ? 'Reports dismissed.' : pending.action === 'remove' ? 'Content removed.' : 'Content restored.',
        );
        this.load(this.page());
      },
      error: (err: unknown) => this.notifications.error(extractApiErrorMessage(err, 'The action failed.')),
    });
  }

  protected openBan(item: ModerationQueueItem): void {
    this.banTarget.set(item);
  }

  protected onBanned(): void {
    const item = this.banTarget();
    this.banTarget.set(null);
    this.notifications.success(`Banned @${item?.preview.authorUsername}. Their sessions were ended.`);
    this.load(this.page());
  }

  protected unban(item: ModerationQueueItem): void {
    const userId = item.preview.authorId;
    if (!userId || this.busyKey()) {
      return;
    }
    this.busyKey.set(this.key(item));
    this.moderation
      .unban(userId, '')
      .pipe(finalize(() => this.busyKey.set(null)))
      .subscribe({
        next: () => {
          this.notifications.success(`Unbanned @${item.preview.authorUsername}.`);
          this.load(this.page());
        },
        error: (err: unknown) => this.notifications.error(extractApiErrorMessage(err, 'Could not unban this user.')),
      });
  }

  private load(page: number): void {
    this.loadRequest?.unsubscribe();
    this.isLoading.set(true);
    this.loadRequest = this.moderation
      .queue({ status: this.status(), targetType: this.type(), page, pageSize: PAGE_SIZE })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.page.set(result.page);
          this.totalCount.set(result.totalCount);
        },
        error: (err: unknown) => this.notifications.error(extractApiErrorMessage(err, 'Failed to load the queue.')),
      });
  }
}
