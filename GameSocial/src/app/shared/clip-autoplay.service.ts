import { Service, signal } from '@angular/core';

const AUTOPLAY_KEY = 'gs.clips.autoplay';

/** Last Autoplay switch position, shared by the Clips rail and the Clip Player queue. */
@Service()
export class ClipAutoplayService {
  readonly autoplay = signal(readAutoplay());

  setAutoplay(value: boolean): void {
    this.autoplay.set(value);
    try {
      localStorage.setItem(AUTOPLAY_KEY, value ? '1' : '0');
    } catch {
      // Storage can be unavailable (private mode) — the switch still works for this session.
    }
  }
}

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}
