import { Directive, output } from '@angular/core';

/**
 * Pointer handling for a horizontal track drawn with plain elements (the clip stage's seek bar and
 * volume bar): positions come out as a 0–1 ratio of the track's width. Pointer capture keeps the
 * drag going when the pointer leaves the track.
 */
@Directive({
  selector: '[appTrackDrag]',
  host: {
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onUp($event)',
  },
})
export class TrackDrag {
  /** Pressed at this ratio — a drag starts. */
  trackPress = output<number>();
  /** Moved to this ratio while pressed. */
  trackDrag = output<number>();
  /** Pointer over the track at this ratio, pressed or not (hover previews). */
  trackHover = output<number>();
  trackRelease = output<void>();

  private dragging = false;

  protected onDown(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.trackPress.emit(ratioFrom(track, event.clientX));
  }

  protected onMove(event: PointerEvent): void {
    const ratio = ratioFrom(event.currentTarget as HTMLElement, event.clientX);
    this.trackHover.emit(ratio);
    if (this.dragging) {
      this.trackDrag.emit(ratio);
    }
  }

  protected onUp(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    if (this.dragging) {
      this.dragging = false;
      this.trackRelease.emit();
    }
  }
}

function ratioFrom(element: HTMLElement, clientX: number): number {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}
