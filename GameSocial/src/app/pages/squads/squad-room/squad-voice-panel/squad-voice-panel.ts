import { Component, input, output, signal } from '@angular/core';
import { SquadSessionModel } from '../../../../models/squad-hub.model';

/**
 * Pinned to the bottom of the room sidebar while you're in a live session —
 * Discord's "voice connected" panel: session name + head count, mic / deafen
 * toggles, leave and (host or founder/admin) end. Voice itself is out of v1
 * scope, so joining is the session RSVP and the toggles only keep local state.
 */
@Component({
  selector: 'app-squad-voice-panel',
  template: `
    <section class="vp" aria-label="Sesli sohbet bağlantısı">
      <div class="vp-head">
        <span class="vp-signal" aria-hidden="true"></span>
        <div class="vp-text">
          <span class="vp-status">Sese bağlı</span>
          <span class="vp-name">{{ session().title }} · {{ session().rsvpCount }}/{{ session().capacity }}</span>
        </div>
      </div>
      <div class="vp-actions">
        <button
          type="button"
          class="vp-toggle"
          [class.off]="micOff()"
          [attr.aria-pressed]="micOff()"
          aria-label="Mikrofonu kapat"
          (click)="micOff.set(!micOff())">🎙</button>
        <button
          type="button"
          class="vp-toggle"
          [class.off]="deafened()"
          [attr.aria-pressed]="deafened()"
          aria-label="Sesi kapat"
          (click)="deafened.set(!deafened())">🎧</button>
        @if (canEnd()) {
          <button type="button" class="vp-btn" [disabled]="busy()" (click)="end.emit()">Bitir</button>
        }
        <button type="button" class="vp-btn vp-leave" [disabled]="busy()" (click)="leave.emit()">Ayrıl</button>
      </div>
    </section>
  `,
  styleUrl: './squad-voice-panel.scss',
})
export class SquadVoicePanel {
  session = input.required<SquadSessionModel>();
  busy = input(false);
  canEnd = input(false);

  leave = output<void>();
  end = output<void>();

  protected readonly micOff = signal(false);
  protected readonly deafened = signal(false);
}
