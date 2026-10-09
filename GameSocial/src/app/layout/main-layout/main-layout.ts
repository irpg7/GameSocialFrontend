import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Topbar } from '../topbar/topbar';
import { ToastList } from '../toast-list/toast-list';
import { MeService } from '../../services/me/me.service';
import { MobileTabBar } from '../mobile-tab-bar/mobile-tab-bar';
import { ReportSheetHost } from '../../shared/report-sheet/report-sheet-host';
import { NotificationCenterService } from '../../services/notification-center/notification-center.service';

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
  imports: [RouterOutlet, Topbar, ToastList, MobileTabBar, ReportSheetHost],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayout implements OnInit {
  private meService = inject(MeService);
  private notificationCenter = inject(NotificationCenterService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /**
   * Routes marked `data: { flush: true }` opt out of the shell's content
   * inset and scrolling so the page can run full-bleed under the topbar and
   * manage its own scroll regions. The squad room needs this: its left
   * sidebar sits flush against the topbar and scrolls independently of the
   * main column (bkz. Gamer Feed.dc.html `onSquad`).
   */
  private readonly routeData = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.deepestRouteData()),
    ),
    { initialValue: {} as Record<string, unknown> },
  );

  protected readonly isFlush = computed(() => this.routeData()['flush'] === true);

  /**
   * Routes marked `data: { immersive: true }` hide the topbar and the bottom
   * tab bar on phones (main-layout.scss) — the squad room brings its own
   * compact header and keeps its composer at the bottom edge. Desktop is unchanged.
   */
  protected readonly isImmersive = computed(() => this.routeData()['immersive'] === true);

  ngOnInit(): void {
    // "Refetch on app init" per the live gamification-state refresh strategy —
    // failures are swallowed, the header/sidebar just show no XP pill/streak.
    this.meService.refresh().subscribe({
      next: (me) => {
        // First sign-in: the onboarding steps come first (once — finishing or skipping marks it done).
        const url = this.router.url;
        if (me.needsOnboarding && !url.startsWith('/onboarding')) {
          void this.router.navigate(['/onboarding'], { queryParams: { returnUrl: url === '/' ? null : url } });
        }
      },
      error: () => void 0,
    });
    // Badges + the user hub (notifications, DMs) for as long as the signed-in shell is up.
    this.notificationCenter.start();
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
