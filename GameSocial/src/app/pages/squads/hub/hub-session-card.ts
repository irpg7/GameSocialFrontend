import { Component, computed, input, output } from '@angular/core';
import { SquadSessionModel } from '../../../models/squad-hub.model';
import { initialOf, sessionLine } from './hub-format';

/**
 * "Open sessions right now" card (expl.html 2a). Live: red-tinted gradient,
 * red dot after the name, a 26px avatar stack and "Join voice". Scheduled:
 * plain card with an outline "I'm in".
 */
@Component({
  selector: 'app-hub-session-card',
  template: `
    <article class="session" [class.live]="session().isLive">
      <span class="session-icon" aria-hidden="true">
        @if (session().squadIconUrl; as icon) {
          <img [src]="icon" alt="" />
        } @else {
          {{ initial() }}
        }
      </span>
      <div class="session-body">
        <div class="session-title">
          <span class="session-name">{{ session().squadName }}</span>
          @if (session().isLive) {
            <span class="session-live-dot"><span class="visually-hidden">Live now</span></span>
          }
        </div>
        <p class="session-line">{{ line() }}</p>
      </div>

      @if (session().isLive) {
        <div class="session-side">
          <div class="session-avatars" aria-hidden="true">
            @for (person of session().attendees; track person.userId) {
              <span class="session-avatar" [attr.title]="person.username">
                @if (person.avatarUrl) {
                  <img [src]="person.avatarUrl" alt="" />
                } @else {
                  {{ person.username.charAt(0).toUpperCase() }}
                }
              </span>
            }
          </div>
          <button
            type="button"
            class="session-btn session-btn-primary"
            [class.going]="session().isGoing"
            [disabled]="busy()"
            [attr.aria-pressed]="session().isGoing"
            (click)="toggle.emit()">{{ session().isGoing ? '✓ In voice' : 'Join voice' }}</button>
        </div>
      } @else {
        <button
          type="button"
          class="session-btn session-btn-outline"
          [class.going]="session().isGoing"
          [disabled]="busy()"
          [attr.aria-pressed]="session().isGoing"
          (click)="toggle.emit()">{{ session().isGoing ? '✓ I\\'m in' : 'I\\'m in' }}</button>
      }
    </article>
  `,
  styleUrl: './hub-session-card.scss',
})
export class HubSessionCard {
  session = input.required<SquadSessionModel>();
  busy = input(false);
  toggle = output<void>();

  protected readonly line = computed(() => sessionLine(this.session()));
  protected readonly initial = computed(() => initialOf(this.session().squadName));
}
