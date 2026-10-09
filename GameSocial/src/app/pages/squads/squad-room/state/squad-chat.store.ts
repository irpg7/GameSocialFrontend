import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { SquadRoomService } from '../../../../services/squad/squad-room.service';
import {
  SquadMessageRemovedEvent,
  SquadPinChangedEvent,
  SquadRealtimeService,
  SquadReactionChangedEvent,
} from '../../../../services/squad/squad-realtime.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { SquadMessageModel } from '../../../../models/squad.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SquadRoomStore } from './squad-room.store';
import { SquadLibraryStore } from './squad-library.store';

const MESSAGE_PAGE_SIZE = 50;
const TYPING_TTL_MS = 4_000;

/**
 * The room's chat: the active channel, its messages (paged, oldest first), sending, reactions,
 * pins, unread pills and "… yazıyor". Keeps itself current from the SignalR room channel
 * (new messages, reactions, pins, typing). Provided by `SquadRoom`.
 */
@Injectable()
export class SquadChatStore {
  private squadService = inject(SquadService);
  private roomService = inject(SquadRoomService);
  private realtime = inject(SquadRealtimeService);
  private notificationService = inject(NotificationService);
  private room = inject(SquadRoomStore);
  private library = inject(SquadLibraryStore);

  readonly activeChannelId = signal<string | null>(null);
  readonly activeChannel = computed(
    () => this.room.channels().find((channel) => channel.id === this.activeChannelId()) ?? null,
  );
  readonly messages = signal<SquadMessageModel[]>([]);
  readonly hasMore = signal(false);
  readonly isLoading = signal(false);
  readonly isSending = signal(false);
  /** Last applied pin state per message id (see applyPin). */
  private readonly pinStates = new Map<string, boolean>();

  /** channelId → (username → expiry timestamp). */
  private readonly typing = signal<Record<string, Record<string, number>>>({});
  /** Ticked by the room every second so typing entries expire on screen. */
  readonly now = signal(Date.now());
  readonly typingUsers = computed(() => {
    const channelId = this.activeChannelId();
    const now = this.now();
    const entries = channelId ? (this.typing()[channelId] ?? {}) : {};
    return Object.entries(entries)
      .filter(([, until]) => until > now)
      .map(([username]) => username);
  });

  constructor() {
    this.realtime.messageCreated$.pipe(takeUntilDestroyed()).subscribe((message) => this.onMessageCreated(message));
    this.realtime.reactionChanged$.pipe(takeUntilDestroyed()).subscribe((event) => this.onReactionChanged(event));
    // Someone else pinned or unpinned: the message's state and the squad's pin count follow live.
    this.realtime.pinChanged$.pipe(takeUntilDestroyed()).subscribe((event) => this.onPinChanged(event));
    this.realtime.messageRemoved$.pipe(takeUntilDestroyed()).subscribe((event) => this.onMessageRemoved(event));
    this.realtime.typing$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId !== this.room.squadId()) {
        return;
      }
      this.typing.update((all) => ({
        ...all,
        [event.channelId]: { ...(all[event.channelId] ?? {}), [event.username]: Date.now() + TYPING_TTL_MS },
      }));
      this.now.set(Date.now());
    });
  }

  reset(): void {
    this.activeChannelId.set(null);
    this.messages.set([]);
    this.pinStates.clear();
    this.hasMore.set(false);
    this.typing.set({});
  }

  selectChannel(channelId: string): void {
    if (channelId === this.activeChannelId()) {
      return;
    }
    this.activeChannelId.set(channelId);
    this.messages.set([]);
    this.hasMore.set(false);
    this.load();
    this.markRead(channelId);
  }

  loadEarlier(): void {
    // Cursor paging: new messages arriving meanwhile cannot shift what "earlier" means.
    const oldest = this.messages()[0];
    if (oldest) {
      this.load(oldest.id);
    }
  }

  reload(): void {
    this.load();
  }

  send(body: string): void {
    const channelId = this.activeChannelId();
    if (!body || channelId === null || this.isSending()) {
      return;
    }
    this.isSending.set(true);
    this.squadService
      .sendMessage(this.room.squadId(), channelId, body)
      .pipe(finalize(() => this.isSending.set(false)))
      .subscribe({
        next: (message) => this.upsert(message),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Mesaj gönderilemedi.')),
      });
  }

  react(message: SquadMessageModel, emoji: string): void {
    this.roomService.toggleReaction(this.room.squadId(), message.channelId, message.id, emoji).subscribe({
      next: (updated) => this.upsert(updated),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Tepki verilemedi.')),
    });
  }

  /** `done` gets the updated message, or null when the toggle failed (the toast is shown here). */
  togglePin(message: SquadMessageModel, done?: (updated: SquadMessageModel | null) => void): void {
    this.squadService.toggleMessagePin(this.room.squadId(), message.channelId, message.id).subscribe({
      next: (updated) => {
        this.applyPin(updated.id, updated.isPinned);
        this.upsert(updated);
        this.notificationService.success(updated.isPinned ? 'Mesaj sabitlendi.' : 'Sabitleme kaldırıldı.');
        done?.(updated);
      },
      error: (err: unknown) => {
        this.notificationService.error(extractApiErrorMessage(err, 'Mesaj sabitlenemedi.'));
        done?.(null);
      },
    });
  }

  typingPing(): void {
    const channelId = this.activeChannelId();
    if (channelId) {
      this.realtime.typing(this.room.squadId(), channelId);
    }
  }

  private load(before?: string): void {
    const channelId = this.activeChannelId();
    if (channelId === null) {
      return;
    }
    this.isLoading.set(true);
    this.squadService
      .listMessages(this.room.squadId(), channelId, before, MESSAGE_PAGE_SIZE)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          if (channelId !== this.activeChannelId()) {
            return;
          }
          // The first load is the newest messages; each page comes back oldest-first, so older pages prepend.
          this.messages.update((existing) => (before ? [...result.items, ...existing] : result.items));
          this.hasMore.set(result.hasMore);
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Mesajlar yüklenemedi.')),
      });
  }

  private onMessageCreated(message: SquadMessageModel): void {
    const squad = this.room.squad();
    if (!squad || !squad.channels.some((channel) => channel.id === message.channelId)) {
      return;
    }
    const isMine = message.userId === this.room.currentUserId();
    if (message.channelId === this.activeChannelId()) {
      this.upsert(message);
      this.clearTyping(message.channelId, message.username);
      if (!isMine) {
        this.markRead(message.channelId);
      }
    } else if (!isMine) {
      this.room.squad.set({
        ...squad,
        channels: squad.channels.map((channel) =>
          channel.id === message.channelId ? { ...channel, unreadCount: channel.unreadCount + 1 } : channel,
        ),
      });
    }
    if (message.kind === 'SharedPost') {
      this.library.loadCounts();
    }
  }

  private onReactionChanged(event: SquadReactionChangedEvent): void {
    if (event.userId === this.room.currentUserId()) {
      return; // our own HTTP response already applied it
    }
    this.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== event.messageId) {
          return message;
        }
        const existing = message.reactions.find((reaction) => reaction.emoji === event.emoji);
        let reactions = message.reactions;
        if (existing) {
          const count = existing.count + (event.added ? 1 : -1);
          reactions =
            count <= 0
              ? reactions.filter((reaction) => reaction !== existing)
              : reactions.map((reaction) => (reaction === existing ? { ...reaction, count } : reaction));
        } else if (event.added) {
          reactions = [...reactions, { emoji: event.emoji, count: 1, reactedByCurrentUser: false }];
        }
        return { ...message, reactions };
      }),
    );
  }

  private onPinChanged(event: SquadPinChangedEvent): void {
    if (event.squadId !== this.room.squadId()) {
      return;
    }
    this.applyPin(event.messageId, event.isPinned);
  }

  /** A moderator removed the message: it leaves the channel (and the pin count, if it was pinned). */
  private onMessageRemoved(event: SquadMessageRemovedEvent): void {
    if (event.squadId !== this.room.squadId()) {
      return;
    }
    const removed = this.messages().find((message) => message.id === event.messageId);
    if (!removed) {
      return;
    }
    if (removed.isPinned) {
      this.applyPin(removed.id, false);
    }
    this.messages.update((messages) => messages.filter((message) => message.id !== event.messageId));
  }

  /** Sets a message's pinned flag and keeps the squad's pin count in step (idempotent). */
  private applyPin(messageId: string, isPinned: boolean): void {
    // The HTTP response and the hub's echo of the same toggle both land here. A message outside the loaded channel
    // has no `isPinned` to compare against, so the last applied state is remembered per id; otherwise the squad's
    // count moved twice (2 pins → 0 after one unpin from the pins sheet).
    const current = this.messages().find((message) => message.id === messageId);
    const known = current?.isPinned ?? this.pinStates.get(messageId);
    this.pinStates.set(messageId, isPinned);
    if (known === isPinned) {
      return;
    }
    this.messages.update((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, isPinned } : message)),
    );
    this.room.squad.update((squad) =>
      squad
        ? { ...squad, pinnedMessageCount: Math.max(0, (squad.pinnedMessageCount ?? 0) + (isPinned ? 1 : -1)) }
        : squad,
    );
  }

  private clearTyping(channelId: string, username: string): void {
    this.typing.update((all) => {
      const channel = { ...(all[channelId] ?? {}) };
      delete channel[username];
      return { ...all, [channelId]: channel };
    });
  }

  private upsert(message: SquadMessageModel): void {
    if (message.channelId !== this.activeChannelId()) {
      return;
    }
    this.messages.update((existing) =>
      existing.some((m) => m.id === message.id)
        ? existing.map((m) => (m.id === message.id ? message : m))
        : [...existing, message],
    );
  }

  /** Clears the channel's unread pill locally and server-side. */
  private markRead(channelId: string): void {
    const squad = this.room.squad();
    if (!squad || !this.room.isMember()) {
      return;
    }
    const channel = squad.channels.find((item) => item.id === channelId);
    if (channel && channel.unreadCount > 0) {
      this.room.squad.set({
        ...squad,
        unreadMessageCount: Math.max(0, squad.unreadMessageCount - channel.unreadCount),
        channels: squad.channels.map((item) => (item.id === channelId ? { ...item, unreadCount: 0 } : item)),
      });
    }
    // Background bookkeeping; a miss only means the pill comes back on the next visit.
    this.roomService.markChannelRead(squad.id, channelId).subscribe({ error: () => void 0 });
  }
}
