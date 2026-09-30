import { Service, computed, signal } from '@angular/core';
import { PostModel } from '../../models/post.model';

/** What the mini player needs to keep playing a clip while you browse. */
export interface PinnedClip {
  post: PostModel;
  /** Position (seconds) the full player was at when it was left. */
  time: number;
  /** The queue the clip was played from ("Hot today", "Following"...), current clip included. */
  queue: PostModel[];
  /** Queue label shown by the Clip Player ("Playing from Hot today"). */
  source: string;
}

/**
 * Cross-route playback state for the Clip Player spec's "Mini player pinned
 * while browsing" state. The Clips page and the Clip Player call `pin()` when
 * they are left while a clip is playing; the main layout's mini player
 * renders whatever is pinned and hands playback back via `takeOver()` when
 * you expand it (⤢) or open a clip page again.
 */
@Service()
export class PlayerStateService {
  private readonly _pinned = signal<PinnedClip | null>(null);
  /** Last Autoplay switch position, shared by the Clips rail and the Clip Player queue. */
  readonly autoplay = signal(readAutoplay());

  readonly pinned = this._pinned.asReadonly();
  readonly index = computed(() => {
    const pinned = this._pinned();
    return pinned ? pinned.queue.findIndex((p) => p.id === pinned.post.id) : -1;
  });
  readonly next = computed(() => {
    const pinned = this._pinned();
    const i = this.index();
    return pinned && i >= 0 && i + 1 < pinned.queue.length ? pinned.queue[i + 1] : null;
  });
  readonly previous = computed(() => {
    const pinned = this._pinned();
    const i = this.index();
    return pinned && i > 0 ? pinned.queue[i - 1] : null;
  });

  pin(clip: PinnedClip): void {
    this._pinned.set({ ...clip, queue: clip.queue.length ? clip.queue : [clip.post] });
  }

  /** Mini player progress — kept so a later takeOver() resumes at the right spot. */
  updateTime(time: number): void {
    const pinned = this._pinned();
    if (pinned) {
      this._pinned.set({ ...pinned, time });
    }
  }

  /** ⏮ / ⏭ in the mini player. */
  step(direction: 1 | -1): void {
    const target = direction === 1 ? this.next() : this.previous();
    const pinned = this._pinned();
    if (pinned && target) {
      this._pinned.set({ ...pinned, post: target, time: 0 });
    }
  }

  /** ✕ — stop and forget. */
  dismiss(): void {
    this._pinned.set(null);
  }

  /** A full player resumes the pinned clip: returns it (once) and clears the mini player. */
  takeOver(postId?: string): PinnedClip | null {
    const pinned = this._pinned();
    if (!pinned || (postId && pinned.post.id !== postId)) {
      return null;
    }
    this._pinned.set(null);
    return pinned;
  }

  setAutoplay(value: boolean): void {
    this.autoplay.set(value);
    try {
      localStorage.setItem(AUTOPLAY_KEY, value ? '1' : '0');
    } catch {
      // Storage can be unavailable (private mode) — the switch still works for this session.
    }
  }
}

const AUTOPLAY_KEY = 'gs.clips.autoplay';

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}
