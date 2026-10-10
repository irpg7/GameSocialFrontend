import { Component, effect, input, model, signal } from '@angular/core';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';

export const POSTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;

/**
 * Game poster field for the backoffice: a 16:9 preview (the picked file, else the current poster, else the
 * placeholder) beside a drop zone. Drag an image onto it or browse; a picked file can be undone back to the
 * current poster. The parent validates type / size on submit (`POSTER_MIME_TYPES`, `MAX_POSTER_BYTES`).
 */
@Component({
  selector: 'app-poster-picker',
  imports: [ImgFallback],
  templateUrl: './poster-picker.html',
  styleUrl: './poster-picker.scss',
})
export class PosterPicker {
  /** The poster the game has now (edit); null when creating. */
  readonly currentUrl = input<string | null>(null);
  /** The newly picked file; null = keep the current poster. */
  readonly file = model<File | null>(null);
  readonly inputId = input('poster-input');

  protected readonly accept = POSTER_MIME_TYPES.join(',');
  protected readonly isDragging = signal(false);
  protected readonly previewUrl = signal<string | null>(null);

  constructor() {
    // An object URL per picked file, revoked when the file changes or the picker goes away.
    effect((onCleanup) => {
      const file = this.file();
      if (!file) {
        this.previewUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(file);
      this.previewUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.file.set(file);
    }
    input.value = ''; // picking the same file again still fires change
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.isDragging.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.file.set(file);
    }
  }

  protected sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
