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
