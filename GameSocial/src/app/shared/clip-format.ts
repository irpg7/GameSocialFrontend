/**
 * Formatting helpers shared by the clip surfaces (feed clip card, Clips page
 * hero + up-next rail). The design renders every clip duration/position as a
 * `m:ss` monospace clock and every post age as a short relative label.
 */

/** `0:24`, `1:04` — the design's clock format for player time and durations. */
export function formatClock(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** `12 min ago` / `2 h ago` / `3 d ago`, matching the design's meta rows. */
export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

/** `1240` → `1.2k`, `296` → `296` — the design's `clipNum` for votes, comments and views. */
export function formatCount(n: number | undefined | null): string {
  const value = n ?? 0;
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

/** `42.1k views` / `1 view`. */
export function formatViews(n: number | undefined | null): string {
  const value = n ?? 0;
  return `${formatCount(value)} ${value === 1 ? 'view' : 'views'}`;
}

/** `2 hours ago` — the Clip Player meta row's long form. */
export function formatAgoLong(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  const unit = (value: number, word: string) => `${value} ${word}${value === 1 ? '' : 's'} ago`;
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return unit(minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return unit(hours, 'hour');
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return unit(days, 'day');
  }
  return new Date(iso).toLocaleDateString();
}

/** `şimdi` / `3 dk` / `1 sa` / `2 g` — the Clips rail comment ages (Turkish in the design). */
export function formatAgoShortTr(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return 'şimdi';
  }
  if (minutes < 60) {
    return `${minutes} dk`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} sa`;
  }
  return `${Math.floor(hours / 24)} g`;
}

/** The clip's playable video media (first Video entry). */
export function clipVideo<T extends { mediaType: string }>(media: T[]): T | undefined {
  return media.find((m) => m.mediaType === 'Video');
}
