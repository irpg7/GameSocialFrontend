import { Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map } from 'rxjs';

/** The app's phone layout: bottom tab bar, compact topbar (layout/mobile-tab-bar, topbar.mobile.scss). */
export const PHONE_QUERY = '(max-width: 768px)';

/**
 * A signal that follows a CSS media query. Use it only where the phone layout needs
 * different markup (a sheet instead of a rail, a compact header instead of the banner);
 * plain styling stays in `@media` rules. Must be called in an injection context.
 */
export function mediaQuery(query: string): Signal<boolean> {
  if (typeof matchMedia !== 'function') {
    return signal(false).asReadonly();
  }
  const list = matchMedia(query);
  return toSignal(fromEvent<MediaQueryListEvent>(list, 'change').pipe(map((event) => event.matches)), {
    initialValue: list.matches,
  });
}
