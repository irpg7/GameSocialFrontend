import { Directive, computed, input, linkedSignal } from '@angular/core';

/** Generated placeholders in `public/assets` — shown when there is no URL or the file fails to load. */
const PLACEHOLDERS = {
  avatar: 'assets/placeholder-avatar.svg',
  game: 'assets/placeholder-game.svg',
  squad: 'assets/placeholder-squad.svg',
  banner: 'assets/placeholder-banner.svg',
} as const;

export type ImgFallbackKind = keyof typeof PLACEHOLDERS;

/**
 * `<img [appImg]="user.avatarUrl" fallback="avatar" />` — binds `src`, and swaps to the
 * placeholder for a null/empty URL or when the file 404s (e.g. a wiped media folder).
 */
@Directive({
  selector: 'img[appImg]',
  host: {
    '[src]': 'src()',
    '(error)': 'failed.set(true)',
  },
})
export class ImgFallback {
  readonly appImg = input<string | null | undefined>();
  readonly fallback = input<ImgFallbackKind>('avatar');

  /** Reset whenever the URL changes, so a new upload gets its own chance to load. */
  protected readonly failed = linkedSignal({ source: this.appImg, computation: () => false });

  protected readonly src = computed(() => {
    const url = this.appImg();
    return url && !this.failed() ? url : PLACEHOLDERS[this.fallback()];
  });
}
