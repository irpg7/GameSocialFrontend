import { Component, OnInit, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, finalize } from 'rxjs';
import { PostModel } from '../../../../models/post.model';
import { SquadGameModel, SquadGuideItemModel, SquadGuideModel } from '../../../../models/squad.model';
import { PostService } from '../../../../services/post/post.service';
import { SquadRoomService } from '../../../../services/squad/squad-room.service';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { agoEn } from '../squad-format';

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 500;
const MAX_ITEMS = 20;

/**
 * Pinned-guide sheet behind the Pinned guides tab: views a guide (its clips
 * and screens, open / feature / edit / delete) and creates or edits one ("＋
 * Pin a guide from #genel": title, description, game, and the squad's own
 * clips and screenshot posts to bundle).
 */
@Component({
  selector: 'app-squad-guide-sheet',
  imports: [FormsModule, SheetModal],
  templateUrl: './squad-guide-sheet.html',
  styleUrl: './squad-guide-sheet.scss',
})
export class SquadGuideSheet implements OnInit {
  private roomService = inject(SquadRoomService);
  private postService = inject(PostService);

  squadId = input.required<string>();
  /** null = create a new guide. */
  guide = input<SquadGuideModel | null>(null);
  games = input<SquadGameModel[]>([]);
  canManage = input(false);
  currentUserId = input<string | undefined>(undefined);

  saved = output<SquadGuideModel>();
  deleted = output<string>();
  openItem = output<SquadGuideItemModel>();
  closed = output<void>();

  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxDescription = MAX_DESCRIPTION;

  protected readonly editing = linkedSignal(() => this.guide() === null);
  protected readonly title = linkedSignal(() => this.guide()?.title ?? '');
  protected readonly description = linkedSignal(() => this.guide()?.description ?? '');
  protected readonly gameId = linkedSignal<number | null>(() => this.guide()?.gameId ?? null);
  protected readonly selectedPostIds = linkedSignal<string[]>(() => this.guide()?.items.map((item) => item.postId) ?? []);

  protected readonly candidates = signal<PostModel[]>([]);
  protected readonly isLoadingCandidates = signal(false);
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly canEdit = computed(() => {
    const guide = this.guide();
    return guide === null || this.canManage() || guide.createdByUserId === this.currentUserId();
  });

  protected readonly heading = computed(() => {
    if (!this.editing()) {
      return this.guide()?.title ?? 'Guide';
    }
    return this.guide() ? 'Guide’ı düzenle' : 'Pin a guide';
  });

  protected readonly subtitle = computed(() => {
    const guide = this.guide();
    if (this.editing()) {
      return 'Squad’a paylaşılan klip ve ekran görüntülerinden bir rehber topla';
    }
    return guide ? `${guide.createdByUsername} · updated ${agoEn(guide.updatedAt)}` : undefined;
  });

  ngOnInit(): void {
    this.loadCandidates();
  }

  protected isSelected(postId: string): boolean {
    return this.selectedPostIds().includes(postId);
  }

  protected toggle(postId: string): void {
    this.selectedPostIds.update((ids) =>
      ids.includes(postId) ? ids.filter((id) => id !== postId) : ids.length >= MAX_ITEMS ? ids : [...ids, postId],
    );
  }

  protected thumb(post: PostModel): string | null {
    const first = post.media[0];
    return first?.thumbnailUrl || (first?.mediaType === 'Photo' ? first.url : null) || null;
  }

  protected startEdit(): void {
    this.editing.set(true);
  }

  protected save(): void {
    this.errorMessage.set(null);
    const title = this.title().trim();
    if (!title) {
      this.errorMessage.set('Başlık zorunlu.');
      return;
    }
    if (this.selectedPostIds().length === 0) {
      this.errorMessage.set('En az bir klip veya ekran görüntüsü seç.');
      return;
    }
    const request = {
      title,
      description: this.description().trim() || undefined,
      gameId: this.gameId() ?? undefined,
      postIds: this.selectedPostIds(),
    };
    const guide = this.guide();
    const call = guide
      ? this.roomService.updateGuide(this.squadId(), guide.id, request)
      : this.roomService.createGuide(this.squadId(), request);
    this.isBusy.set(true);
    call.pipe(finalize(() => this.isBusy.set(false))).subscribe({
      next: (result) => this.saved.emit(result),
      error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Guide kaydedilemedi.')),
    });
  }

  protected feature(): void {
    const guide = this.guide();
    if (!guide) {
      return;
    }
    this.isBusy.set(true);
    this.roomService
      .featureGuide(this.squadId(), guide.id)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: (result) => this.saved.emit(result),
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Guide sabitlenemedi.')),
      });
  }

  protected remove(): void {
    const guide = this.guide();
    if (!guide) {
      return;
    }
    this.isBusy.set(true);
    this.roomService
      .deleteGuide(this.squadId(), guide.id)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: () => this.deleted.emit(guide.id),
        error: (err) => this.errorMessage.set(extractApiErrorMessage(err, 'Guide silinemedi.')),
      });
  }

  private loadCandidates(): void {
    this.isLoadingCandidates.set(true);
    forkJoin([
      this.postService.getPosts(1, 30, { squadId: this.squadId(), postType: 'Clip' }),
      this.postService.getPosts(1, 30, { squadId: this.squadId(), postType: 'Screenshots' }),
    ])
      .pipe(finalize(() => this.isLoadingCandidates.set(false)))
      .subscribe({
        next: ([clips, screens]) =>
          this.candidates.set(
            [...clips.items, ...screens.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          ),
        error: () => this.candidates.set([]),
      });
  }
}
