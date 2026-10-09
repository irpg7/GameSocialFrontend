import { PostType } from '../../../models/post-enums.model';

// Limits shared by the composer's panels and sheets. They mirror CreatePostCommandValidator.cs.
export const MAX_CAPTION_LENGTH = 500;
export const MAX_TITLE_LENGTH = 200;
export const MAX_BODY_LENGTH = 10000;
export const MAX_TAG_LENGTH = 50;
export const MAX_POLL_OPTION_LENGTH = 120;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_SCREENSHOTS = 10;
export const MAX_POST_TAGS = 8;
export const MAX_POST_TAG_LENGTH = 30;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A picked file plus its object-URL preview. The composer revokes the URL when it lets go of the file. */
export interface MediaEntry {
  file: File;
  previewUrl: string;
}

export function mediaEntry(file: File): MediaEntry {
  return { file, previewUrl: URL.createObjectURL(file) };
}

export function revokeMedia(entry: MediaEntry | null | undefined): void {
  if (entry) {
    URL.revokeObjectURL(entry.previewUrl);
  }
}

/** A game select's value ('' = none) as the numeric id the API wants. */
export function idOrNull(value: string): number | null {
  return value === '' ? null : Number(value);
}

/** What a sheet hands the composer to send (the composer owns the request and its busy state). */
export interface ComposerSubmission {
  type: PostType;
  asDraft: boolean;
  formData: FormData;
}

/** 12400 → "12.4k", 1_200_000 → "1.2M". */
export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(value);
}
