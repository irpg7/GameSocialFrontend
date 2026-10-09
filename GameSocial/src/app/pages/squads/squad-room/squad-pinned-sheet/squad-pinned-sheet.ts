import { Component, inject, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PinnedSquadMessageModel } from '../../../../models/squad.model';
import { SquadService } from '../../../../services/squad/squad.service';
import { BlockService } from '../../../../services/safety/block.service';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { LoadError } from '../../../../shared/load-error/load-error';
import { ImgFallback } from '../../../../shared/img-fallback/img-fallback';
import { SquadRoomStore } from '../state/squad-room.store';
import { SquadChatStore } from '../state/squad-chat.store';
import { agoTr } from '../squad-format';

const PAGE_SIZE = 20;

/**
 * "📌 Sabitlenen mesajlar": every pinned message of the squad, across channels, newest first. Opened from the
 * pinned bar at the top of the chat. "Kanala git" switches the room to the message's channel; the author and the
 * squad's managers can unpin (the server enforces the same rule).
 */
@Component({
  selector: 'app-squad-pinned-sheet',
  imports: [SheetModal, LoadError, ImgFallback],
  templateUrl: './squad-pinned-sheet.html',
  styleUrl: './squad-pinned-sheet.scss',
})
export class SquadPinnedSheet {
  private readonly squadService = inject(SquadService);
  private readonly blockService = inject(BlockService);
  protected readonly room = inject(SquadRoomStore);
  private readonly chat = inject(SquadChatStore);

  closed = output<void>();
  /** The user picked "Kanala git": the room switches to the chat tab on that channel. */
  goToChannel = output<string>();

  protected readonly pins = signal<PinnedSquadMessageModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly ago = agoTr;
  private page = 1;

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.isLoading.set(true);
    if (page === 1) {
      this.loadError.set(null);
    }
    this.squadService
      .listPins(this.room.squadId(), page, PAGE_SIZE)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.page = result.page;
          this.pins.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.hasMore.set(result.hasMore);
        },
        error: () => {
          if (page === 1) {
            this.loadError.set('Sabitlenen mesajlar yüklenemedi.');
          }
        },
      });
  }

  protected loadMore(): void {
    this.load(this.page + 1);
  }

  /** Same rule as the server: the author, or the squad's captain/admins. */
  protected canUnpin(pin: PinnedSquadMessageModel): boolean {
    return this.room.isManager() || pin.userId === this.room.currentUserId();
  }

  /** Blocked authors' pins stay folded, like their messages in the chat. */
  protected isHidden(pin: PinnedSquadMessageModel): boolean {
    return this.blockService.isBlocked(pin.userId);
  }

  protected summary(pin: PinnedSquadMessageModel): string {
    if (pin.sharedPost) {
      const kind = pin.sharedPost.postType === 'Clip' ? 'Klip' : 'Ekran görüntüleri';
      return pin.sharedPost.caption ? `${kind} · ${pin.sharedPost.caption}` : kind;
    }
    return pin.body ?? '';
  }

  protected unpin(pin: PinnedSquadMessageModel): void {
    this.busyId.set(pin.id);
    this.chat.togglePin(pin, (updated) => {
      this.busyId.set(null);
      if (updated && !updated.isPinned) {
        this.pins.update((list) => list.filter((p) => p.id !== pin.id));
      }
    });
  }
}
