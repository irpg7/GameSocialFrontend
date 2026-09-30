import { Component, computed, input, output, signal } from '@angular/core';
import { SquadSessionModel } from '../../../models/squad-hub.model';

/**
 * The hub's bottom voice/party bar (expl.html 2a, 56px): the live session
 * you're in (or the first live one in your squads), its attendees, mic /
 * headphone toggles and "Join voice". Voice itself is out of v1 scope (2b),
 * so "Join voice" is the session RSVP and the toggles only keep local state.
 */
@Component({
  selector: 'app-hub-voice-bar',
  template: `
    <section class="voice" aria-label="Live squad session">
      <div class="voice-id">
        <span class="voice-dot" aria-hidden="true"></span>
        <span class="voice-name">{{ session().squadName }}</span>
        <span class="voice-count">· voice, {{ session().rsvpCount }} in</span>
      </div>
      <div class="voice-avatars" aria-hidden="true">
        @for (person of session().attendees; track person.userId; let first = $first) {
          <span class="voice-avatar" [class.host]="first" [attr.title]="person.username">
            @if (person.avatarUrl) {
              <img [src]="person.avatarUrl" alt="" />
            } @else {
              {{ person.username.charAt(0).toUpperCase() }}
            }
          </span>
        }
      </div>
      <div class="voice-actions">
        <button
          type="button"
          class="voice-toggle"
          [class.off]="micOff()"
          [attr.aria-pressed]="micOff()"
          aria-label="Mute microphone"
          (click)="micOff.set(!micOff())">🎙</button>
        <button
          type="button"
          class="voice-toggle"
          [class.off]="deafened()"
          [attr.aria-pressed]="deafened()"
          aria-label="Deafen"
          (click)="deafened.set(!deafened())">🎧</button>
        <button type="button" class="voice-join" [class.going]="session().isGoing" [disabled]="busy()" (click)="toggle.emit()">
          {{ joinLabel() }}
        </button>
      </div>
    </section>
  `,
  styleUrl: './hub-voice-bar.scss',
})
export class HubVoiceBar {
  session = input.required<SquadSessionModel>();
  busy = input(false);
  toggle = output<void>();

  protected readonly micOff = signal(false);
  protected readonly deafened = signal(false);
  protected readonly joinLabel = computed(() => (this.session().isGoing ? 'Leave voice' : 'Join voice'));
}
