import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NotificationCenterService } from '../../services/notification-center/notification-center.service';

/** Topbar link to `/messages` with the "conversations with unread messages" badge (kept live by the user hub). */
@Component({
  selector: 'app-messages-link',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <a
      class="msg"
      routerLink="/messages"
      routerLinkActive="active"
      [attr.aria-label]="center.counts().messages ? 'Messages, ' + center.counts().messages + ' unread' : 'Messages'">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
      @if (center.counts().messages > 0) {
        <span class="badge" aria-hidden="true">{{ center.counts().messages > 99 ? '99+' : center.counts().messages }}</span>
      }
    </a>
  `,
  styles: `
    @use 'topbar-icon' as *;

    :host {
      display: block;
    }

    .msg {
      @include topbar-icon-button;
    }

    .badge {
      @include topbar-badge;
    }
  `,
})
export class MessagesLink {
  protected readonly center = inject(NotificationCenterService);
}
