import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FieldTree, FormField, form, maxLength } from '@angular/forms/signals';
import { PostMediaType, PostPhotoType } from '../../../../models/post-enums.model';
import {
  MAX_CAPTION_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_POST_TAG_LENGTH,
  MAX_POST_TAGS,
  MAX_SCREENSHOTS,
  MediaEntry,
  PHOTO_MIME_TYPES,
  mediaEntry,
  revokeMedia,
} from '../composer-shared';
import { ComposerSharedFields } from '../composer-clip-panel/composer-clip-panel';

/** Screenshots panel preset tag chips (design: "Photo mode", "No spoilers", "＋ tag"). */
const PRESET_SCREENSHOT_TAGS = ['Photo mode', 'No spoilers'];

/** Picked photos and tags; held by the composer so they survive switching tabs. */
export interface ScreenshotsState {
  files: MediaEntry[];
  tags: string[];
}

export function emptyScreenshotsState(): ScreenshotsState {
  return { files: [], tags: [] };
}

/**
 * Composer bar → ▣ Screenshots (01-feed L128-158): up to ten photos in a 4-column grid, a caption and
 * tag chips. Problems the user should see (too many files, too many tags) go out through `problem`
 * so the composer shows them in its one error line.
 */
@Component({
  selector: 'app-composer-screenshots-panel',
  imports: [FormField],
  templateUrl: './composer-screenshots-panel.html',
  styleUrl: './composer-screenshots-panel.scss',
})
export class ComposerScreenshotsPanel {
  private injector = inject(Injector);

  fields = input.required<FieldTree<ComposerSharedFields>>();
  preselectedSquadId = input<string | null>(null);
  lockedSquadName = input<string | undefined>(undefined);
  state = model.required<ScreenshotsState>();
  problem = output<string>();

  protected readonly presetTags = PRESET_SCREENSHOT_TAGS;
  protected readonly maxScreenshots = MAX_SCREENSHOTS;

  private screenshotsInputRef = viewChild<ElementRef<HTMLInputElement>>('screenshotsInput');
  private tagInputRef = viewChild<ElementRef<HTMLInputElement>>('tagInput');

  protected readonly isDragging = signal(false);
  protected readonly isAddingTag = signal(false);
  private readonly tagModel = signal({ newTag: '' });
  protected readonly tagForm = form(this.tagModel, (path) => {
    maxLength(path.newTag, MAX_POST_TAG_LENGTH);
  });

  protected readonly files = computed(() => this.state().files);
  /** Custom tags (everything that isn't one of the preset chips), rendered after them. */
  protected readonly customTags = computed(() => this.state().tags.filter((t) => !PRESET_SCREENSHOT_TAGS.includes(t)));

  protected browse(): void {
    this.screenshotsInputRef()?.nativeElement.click();
  }

  protected onFilesSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const picked = Array.from(inputEl.files ?? []);
    inputEl.value = '';
    this.addFiles(picked);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected remove(index: number): void {
    revokeMedia(this.files()[index]);
    this.state.update((s) => ({ ...s, files: s.files.filter((_, i) => i !== index) }));
  }

  protected hasTag(tag: string): boolean {
    return this.state().tags.includes(tag);
  }

  protected toggleTag(tag: string): void {
    if (this.hasTag(tag)) {
      this.state.update((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
    } else if (this.state().tags.length < MAX_POST_TAGS) {
      this.state.update((s) => ({ ...s, tags: [...s.tags, tag] }));
    }
  }

  protected startAddingTag(): void {
    if (this.state().tags.length >= MAX_POST_TAGS) {
      this.problem.emit(`At most ${MAX_POST_TAGS} tags.`);
      return;
    }
    this.isAddingTag.set(true);
    afterNextRender(() => this.tagInputRef()?.nativeElement.focus(), { injector: this.injector });
  }

  protected commitTag(): void {
    const tag = this.tagModel().newTag.trim().replace(/^#/, '');
    const tags = this.state().tags;
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      const next = [...tags, tag.slice(0, MAX_POST_TAG_LENGTH)].slice(0, MAX_POST_TAGS);
      this.state.update((s) => ({ ...s, tags: next }));
    }
    this.cancelTag();
  }

  protected cancelTag(): void {
    this.tagModel.set({ newTag: '' });
    this.isAddingTag.set(false);
  }

  private addFiles(picked: File[]): void {
    if (picked.length === 0) {
      return;
    }
    const room = MAX_SCREENSHOTS - this.files().length;
    const accepted = picked.slice(0, Math.max(room, 0));
    this.state.update((s) => ({ ...s, files: [...s.files, ...accepted.map(mediaEntry)] }));
    if (picked.length > accepted.length) {
      this.problem.emit(`Only up to ${MAX_SCREENSHOTS} photos are allowed — extra files were skipped.`);
    }
  }
}

export function validateScreenshots(fields: ComposerSharedFields, state: ScreenshotsState): string | null {
  const files = state.files;
  if (files.length < 1 || files.length > MAX_SCREENSHOTS) {
    return `Please attach 1 to ${MAX_SCREENSHOTS} photos.`;
  }
  if (fields.caption.length > MAX_CAPTION_LENGTH) {
    return `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
  }
  for (const entry of files) {
    if (!PHOTO_MIME_TYPES.includes(entry.file.type)) {
      return 'Unsupported image format. Use jpg, png or webp.';
    }
    if (entry.file.size > MAX_PHOTO_BYTES) {
      return 'Each image must be 5MB or smaller.';
    }
  }
  return null;
}

export function appendScreenshots(formData: FormData, fields: ComposerSharedFields, state: ScreenshotsState): void {
  if (fields.caption.trim()) {
    formData.append('Caption', fields.caption.trim());
  }
  if (fields.squadId) {
    formData.append('SquadId', fields.squadId);
  }
  for (const tag of state.tags) {
    formData.append('Tags', tag);
  }
  formData.append('MediaType', String(PostMediaType.Photo));
  formData.append('PhotoType', String(PostPhotoType.Screenshot));
  for (const entry of state.files) {
    formData.append('Media', entry.file);
  }
}
