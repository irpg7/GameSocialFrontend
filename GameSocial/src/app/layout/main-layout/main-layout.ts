import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Topbar } from '../topbar/topbar';
import { ToastList } from '../toast-list/toast-list';
import { MeService } from '../../services/me/me.service';

/**
 * Shell for every authenticated route. No longer owns a global right rail —
 * the previous `ProfilePanel` (identity card + games-discovery list) has
 * been retired: identity now lives in the header's account menu, and its
 * games-discovery content is superseded by the Feed page's own left sidebar
 * "Follow Games" tab. Feed is the only page with a 3-column layout; it owns
 * its left/right rails directly rather than through this shared layout, so
 * there is exactly one "profile panel" concept left in the app, not two.
 */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Topbar, ToastList],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayout implements OnInit {
  private meService = inject(MeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /**
   * Routes marked `data: { flush: true }` opt out of the shell's content
   * inset and scrolling so the page can run full-bleed under the topbar and
   * manage its own scroll regions. The squad room needs this: its left
   * sidebar sits flush against the topbar and scrolls independently of the
   * main column (bkz. Gamer Feed.dc.html `onSquad`).
   */
  protected readonly isFlush = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.deepestRouteData()['flush'] === true),
    ),
    { initialValue: false },
  );

  ngOnInit(): void {
    // "Refetch on app init" per the live gamification-state refresh strategy —
    // failures are swallowed, the header/sidebar just show no XP pill/streak.
    this.meService.refresh().subscribe({ error: () => void 0 });
  }

  /**
   * Walks to the deepest activated child and returns its route data.
   *
   * `snapshot` is read defensively: this also runs once on the initial
   * (pre-navigation) emission, when the child route is not activated yet and
   * the snapshot is still undefined.
   */
  private deepestRouteData(): Record<string, unknown> {
    let route: ActivatedRoute | null = this.route;
    let data: Record<string, unknown> = {};
    while (route) {
      data = route.snapshot?.data ?? data;
      route = route.firstChild;
    }
    return data;
  }
}
