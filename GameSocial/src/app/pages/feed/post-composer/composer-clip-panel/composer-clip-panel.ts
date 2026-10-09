import { Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { SelectControl } from '../../../../shared/select-control';
import { GamePicker } from '../../../../shared/game-picker/game-picker';
import { SquadModel } from '../../../../models/squad.model';
import { PostMediaType } from '../../../../models/post-enums.model';
import { XpAwardsService } from '../../../../services/config/xp-awards.service';
import {
  MAX_CAPTION_LENGTH,
  MAX_VIDEO_BYTES,
  MediaEntry,
  VIDEO_MIME_TYPES,
  idOrNull,
  mediaEntry,
  revokeMedia,
} from '../composer-shared';

/** The composer fields the clip and screenshots panels share (switching tabs keeps them). */
export interface ComposerSharedFields {
  caption: string;
  gameId: string;
  squadId: string;
}

/**
 * Composer bar → ▶ Clip (01-feed L128-158): video drop zone, title, game and the optional squad tag.
 * The picked file lives in the composer (`clip`), so it survives switching tabs; the composer's Post
 * button sends it through `validateClip` / `appendClip`.
 */
@Component({
  selector: 'app-composer-clip-panel',
  imports: [FormField, SelectControl, GamePicker],
  templateUrl: './composer-clip-panel.html',
  styleUrl: './composer-clip-panel.scss',
})
export class ComposerClipPanel {
  private xpAwards = inject(XpAwardsService);

  fields = input.required<FieldTree<ComposerSharedFields>>();
  mySquads = input<SquadModel[]>([]);
  preselectedSquadId = input<string | null>(null);
  lockedSquadName = input<string | undefined>(undefined);
  clip = model<MediaEntry | null>(null);

  private fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly isDragging = signal(false);
  protected readonly isSquadPlaceholder = computed(() => !this.fields().squadId().value());

  /** Real XP for a clip ("Posting a clip is worth +120 XP") — from GET config/xp-awards. */
  protected readonly clipXp = computed(() => this.xpAwards.amount('clip'));

  protected browse(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    this.setFile(inputEl.files?.[0] ?? null);
  }

  protected clearFile(event: Event): void {
    event.stopPropagation();
    this.setFile(null);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.setFile(event.dataTransfer?.files?.[0] ?? null);
  }

  private setFile(file: File | null): void {
    revokeMedia(this.clip());
    this.clip.set(file ? mediaEntry(file) : null);
    const inputEl = this.fileInputRef()?.nativeElement;
    if (!file && inputEl) {
      inputEl.value = '';
    }
  }
}

export function validateClip(fields: ComposerSharedFields, clip: MediaEntry | null): string | null {
  if (idOrNull(fields.gameId) === null) {
    return 'Please select a game.';
  }
  if (!clip) {
    return 'Please attach a video.';
  }
  if (fields.caption.length > MAX_CAPTION_LENGTH) {
    return `Title must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
  }
  if (!VIDEO_MIME_TYPES.includes(clip.file.type)) {
    return 'Unsupported video format. Use mp4, mov or webm.';
  }
  if (clip.file.size > MAX_VIDEO_BYTES) {
    return 'Video must be 100MB or smaller.';
  }
  return null;
}

export function appendClip(formData: FormData, fields: ComposerSharedFields, clip: MediaEntry): void {
  formData.append('GameId', fields.gameId);
  if (fields.caption.trim()) {
    formData.append('Caption', fields.caption.trim());
  }
  if (fields.squadId) {
    formData.append('SquadId', fields.squadId);
  }
  formData.append('MediaType', String(PostMediaType.Video));
  formData.append('Media', clip.file);
}
