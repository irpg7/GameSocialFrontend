import { Component, ElementRef, OnDestroy, OnInit, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { SelectControl } from '../select-control';
import { finalize } from 'rxjs';
import { SheetModal } from '../sheet-modal/sheet-modal';
import { PostService } from '../../services/post/post.service';
import { GameService } from '../../services/game/game.service';
import { SquadService } from '../../services/squad/squad.service';
import { NotificationService } from '../../services/notification/notification.service';
import { XpAwardsService } from '../../services/config/xp-awards.service';
import { GameLookup } from '../../services/game/game-lookup.service';
import { GamePicker } from '../game-picker/game-picker';
import { SquadModel } from '../../models/squad.model';
import { PostModel } from '../../models/post.model';
import { PostMediaType, PostType } from '../../models/post-enums.model';
import { extractApiErrorMessage } from '../api-error.util';
import { formatClock } from '../clip-format';

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** "up to 60 s · we trim and compress it" — longer files are trimmed server-side. */
const MAX_CLIP_SECONDS = 60;
const MAX_TITLE = 500;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

/**
 * "Upload a clip" — Gamer Feed.dc.html's `sheetClip`: dropzone, title, game
 * picker + "＋ Tag a squad", hashtag chips with "＋ tag", the "Also post to
 * <squad> #clips" switch, the XP hint, and Cancel / Save draft / Post clip.
 * Opened by the Clips page's "＋ Upload a clip".
 */
@Component({
  selector: 'app-clip-upload-sheet',
  imports: [SheetModal, FormField, SelectControl, GamePicker],
  templateUrl: './clip-upload-sheet.html',
  styleUrl: './clip-upload-sheet.scss',
})
export class ClipUploadSheet implements OnInit, OnDestroy {
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private gameLookup = inject(GameLookup);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  private xpAwards = inject(XpAwardsService);

  closed = output<void>();
  /** Fires with the created post; `isDraft` tells published clips from drafts. */
  posted = output<PostModel>();

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly tagInput = viewChild<ElementRef<HTMLInputElement>>('tagInput');

  protected readonly squads = signal<SquadModel[]>([]);
  protected readonly file = signal<File | null>(null);
  protected readonly fileDuration = signal<number | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly isDragging = signal(false);

  /**
   * Title + game + squad (Signal Forms). Selects hold strings: `gameId` is the game's id as text
   * ('' = none yet), `squadId` is '' for "＋ Tag a squad".
   */
  private readonly model = signal({ title: '', gameId: '', squadId: '' });
  protected readonly clipForm = form(this.model, (path) => {
    maxLength(path.title, MAX_TITLE);
  });
  protected readonly squadId = computed(() => this.model().squadId || null);

  protected readonly alsoPostToSquad = signal(true);
  protected readonly tags = signal<string[]>([]);
  /** The "＋ tag" chip input — its own one-field form, committed into `tags`. */
  protected readonly tagDraft = signal('');
  protected readonly tagField = form(this.tagDraft, (path) => maxLength(path, MAX_TAG_LENGTH));
  protected readonly isAddingTag = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly xp = computed(() => this.xpAwards.amount('clip'));
  protected readonly squad = computed(() => this.squads().find((s) => s.id === this.squadId()) ?? null);
  protected readonly durationLabel = computed(() => {
    const seconds = this.fileDuration();
    return seconds == null ? null : formatClock(seconds);
  });
  protected readonly willTrim = computed(() => (this.fileDuration() ?? 0) > MAX_CLIP_SECONDS);
  protected readonly canAddTag = computed(() => this.tags().length < MAX_TAGS);

  ngOnInit(): void {
    // Start on the first game you follow (A–Z), as the old select started on its first option.
    this.gameService.list({ followedFirst: true, pageSize: 1 }).subscribe({
      next: (page) => {
        this.gameLookup.remember(page.items);
        const first = page.items[0];
        if (!this.model().gameId && first) {
          this.model.update((m) => ({ ...m, gameId: String(first.id) }));
        }
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Oyunlar yüklenemedi.')),
    });
    this.squadService.getMine().subscribe({
      next: (squads) => {
        this.squads.set(squads);
        if (squads.length > 0) {
          this.model.update((m) => ({ ...m, squadId: squads[0].id }));
        }
      },
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, "Squad'lar yüklenemedi.")),
    });
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  // ─── File ──────────────────────────────────────────────────────────────
  protected browse(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    if (chosen) {
      this.accept(chosen);
    }
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) {
      this.accept(dropped);
    }
  }

  protected clearFile(event: Event): void {
    event.stopPropagation();
    this.file.set(null);
    this.fileDuration.set(null);
    this.revokePreview();
  }

  protected onPreviewMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.fileDuration.set(Number.isFinite(video.duration) ? video.duration : null);
  }

  private accept(file: File): void {
    if (!VIDEO_TYPES.includes(file.type)) {
      this.error.set('Desteklenmeyen format — MP4, MOV veya WebM yükle.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set('Video en fazla 100 MB olabilir.');
      return;
    }
    this.error.set(null);
    this.revokePreview();
    this.file.set(file);
    this.fileDuration.set(null);
    this.previewUrl.set(URL.createObjectURL(file));
    if (!this.model().title.trim()) {
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, MAX_TITLE);
      this.model.update((m) => ({ ...m, title }));
    }
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
  }

  // ─── Tags ──────────────────────────────────────────────────────────────
  protected startTag(): void {
    this.isAddingTag.set(true);
    setTimeout(() => this.tagInput()?.nativeElement.focus());
  }

  protected commitTag(): void {
    const raw = this.tagDraft().trim().replace(/^#+/, '').replace(/\s+/g, '');
    this.tagDraft.set('');
    this.isAddingTag.set(false);
    if (!raw || !this.canAddTag()) {
      return;
    }
    const tag = `#${raw}`.slice(0, MAX_TAG_LENGTH);
    if (!this.tags().some((t) => t.toLowerCase() === tag.toLowerCase())) {
      this.tags.update((tags) => [...tags, tag]);
    }
  }

  protected onTagKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      this.commitTag();
      if (this.canAddTag()) {
        this.startTag();
      }
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.tagDraft.set('');
      this.isAddingTag.set(false);
    }
  }

  protected removeTag(tag: string): void {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
  }

  protected toggleAlsoPost(): void {
    this.alsoPostToSquad.update((value) => !value);
  }

  // ─── Submit ────────────────────────────────────────────────────────────
  protected submit(isDraft: boolean): void {
    if (this.isSubmitting()) {
      return;
    }
    const file = this.file();
    if (!file) {
      this.error.set('Önce bir klip seç.');
      return;
    }
    const { title: rawTitle, gameId, squadId } = this.model();
    if (!gameId) {
      this.error.set('Bir oyun seç.');
      return;
    }
    this.error.set(null);

    const form = new FormData();
    form.append('PostType', String(PostType.Clip));
    form.append('GameId', gameId);
    const title = rawTitle.trim();
    if (title) {
      form.append('Caption', title);
    }
    if (squadId && this.alsoPostToSquad()) {
      form.append('SquadId', squadId);
    }
    for (const tag of this.tags()) {
      form.append('Tags', tag);
    }
    if (isDraft) {
      form.append('IsDraft', 'true');
    }
    form.append('MediaType', String(PostMediaType.Video));
    form.append('Media', file);

    this.isSubmitting.set(true);
    this.postService
      .createPost(form)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (post) => {
          this.notificationService.success(isDraft ? 'Taslak kaydedildi.' : 'Klip paylaşıldı.');
          this.posted.emit(post);
          this.closed.emit();
        },
        error: (err) => this.error.set(extractApiErrorMessage(err, 'Klip yüklenemedi.')),
      });
  }
}
