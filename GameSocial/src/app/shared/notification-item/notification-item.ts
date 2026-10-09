import { Component, computed, input, output } from '@angular/core';
import { AppNotification } from '../../models/notification-center.model';
import { ImgFallback } from '../img-fallback/img-fallback';
import { formatTimeAgo } from '../clip-format';
import { describeNotification } from './notification-text';

/**
 * One notification row (topbar bell panel and the /notifications page). The host list owns navigation and
 * mark-read; this only renders and emits `activate`.
 */
@Component({
  selector: 'app-notification-item',
  imports: [ImgFallback],
  template: `
    <button type="button" class="ni" [class.unread]="!notification().isRead" (click)="activate.emit(notification())">
      <span class="ni-avatar" aria-hidden="true">
        @if (notification().actorId) {
          <img [appImg]="notification().actorAvatarUrl" fallback="avatar" alt="" />
        } @else {
          <span class="ni-system">◈</span>
        }
      </span>
      <span class="ni-body">
        <span class="ni-text">
          @if (parts().actor; as actor) {
            <strong>{{ actor }}</strong>
          }
          {{ parts().text }}
        </span>
        @if (parts().quote; as quote) {
          <span class="ni-quote">{{ quote }}</span>
        }
        <span class="ni-time">{{ ago() }}</span>
      </span>
      @if (!notification().isRead) {
        <span class="ni-dot"><span class="visually-hidden">Unread</span></span>
      }
    </button>
  `,
  styles: `
    @use '../../../styles/variables' as *;

    :host {
      display: block;
    }

    .ni {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 10px 12px;
      border: none;
      border-radius: $border-radius-md;
      background: transparent;
      color: $color-text-secondary;
      text-align: left;
      font: inherit;
      cursor: pointer;

      &:hover {
        background: $color-bg-row;
      }

      &:focus-visible {
        outline: 2px solid $color-accent-light;
        outline-offset: -2px;
      }

      &.unread {
        color: $color-text-primary;
      }
    }

    .ni-avatar {
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: $border-radius-md;
      overflow: hidden;
      background: $color-border-strong;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .ni-system {
      color: $color-accent-light;
      font-size: 16px;
    }

    .ni-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .ni-text {
      font-size: 13.5px;
      line-height: 1.4;
      overflow-wrap: anywhere;

      strong {
        color: $color-text-primary;
        font-weight: 700;
      }
    }

    .ni-quote {
      font-size: 12.5px;
      color: $color-text-hint;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ni-time {
      font-size: 11.5px;
      color: $color-text-tertiary;
    }

    .ni-dot {
      width: 8px;
      height: 8px;
      margin-top: 6px;
      flex: none;
      border-radius: $border-radius-full;
      background: $color-accent-primary;
    }
  `,
})
export class NotificationItem {
  readonly notification = input.required<AppNotification>();
  readonly activate = output<AppNotification>();

  protected readonly parts = computed(() => describeNotification(this.notification()));
  protected readonly ago = computed(() => formatTimeAgo(this.notification().createdAt));
}
