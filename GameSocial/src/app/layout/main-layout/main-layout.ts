import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  ngOnInit(): void {
    // "Refetch on app init" per the live gamification-state refresh strategy —
    // failures are swallowed, the header/sidebar just show no XP pill/streak.
    this.meService.refresh().subscribe({ error: () => void 0 });
  }
}
