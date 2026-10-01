import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface Tab {
  label: string;
  link: string;
  /** One stroke path, 24×24 viewBox. */
  icon: string;
}

const TABS: Tab[] = [
  { label: 'Feed', link: '/feed', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { label: 'Clips', link: '/clips', icon: 'M4 5h16v14H4zM10 9v6l5-3z' },
  { label: 'Reviews', link: '/reviews', icon: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z' },
  { label: 'Squads', link: '/squads', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M21 19c0-2.6-1.7-4.8-4-5.6' },
  { label: 'Trophies', link: '/trophies', icon: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M10 17h4v4h-4z' },
];

/**
 * Phone navigation (≤ 768px): the topbar's page links move into this bottom
 * tab bar — the active tab gets the red pill. Hidden on wider screens, where
 * the topbar shows the links itself.
 */
@Component({
  selector: 'app-mobile-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" aria-label="Main">
      @for (tab of tabs; track tab.link) {
        <a class="tab" [routerLink]="tab.link" routerLinkActive="active" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
          <span class="pill" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path [attr.d]="tab.icon" />
            </svg>
          </span>
          <span class="label">{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  styleUrl: './mobile-tab-bar.scss',
})
export class MobileTabBar {
  protected readonly tabs = TABS;
}
