import { Component, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { SquadModel } from '../../../models/squad.model';
import { SquadHubService } from '../../../services/squad/squad-hub.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SquadSheetFrame } from '../../../shared/squad-create-sheet/squad-sheet-frame';
import { PlayerOption, PlayerPicker } from '../../../shared/player-picker/player-picker';

/**
 * "Invite" on a "Your squads" card — sends SquadInvites. The player picker
 * suggests people you follow (then any player) and only yields real
 * accounts; picking one sends the invite straight away.
 */
@Component({
  selector: 'app-hub-invite-sheet',
  imports: [SquadSheetFrame, PlayerPicker],
  template: `
    <app-squad-sheet-frame
      [title]="'Invite to ' + squad().name"
      subtitle="They'll see it under Squad invites and can accept from there"
      [width]="460"
      (closed)="closed.emit()">
      <div class="hs-body">
        <div>
          <label class="hs-label" for="hub-invite-username">Friend or username</label>
          <app-player-picker
            inputId="hub-invite-username"
            appearance="field"
            placeholder="Search a friend or username"
            [exclude]="sent()"
            (picked)="send($event)" />
        </div>
        @if (isSending()) {
          <p class="hs-note" aria-live="polite">Sending…</p>
        }
        @if (sent().length > 0) {
          <div class="hs-sent" aria-live="polite">
            @for (name of sent(); track name) {
              <span>✓ {{ name }}</span>
            }
          </div>
        }
        @if (error(); as message) {
          <p class="hs-error" role="alert">{{ message }}</p>
        }
      </div>
      <div class="hs-footer">
        <button type="button" class="hs-primary" (click)="closed.emit()">Done</button>
      </div>
    </app-squad-sheet-frame>
  `,
  styleUrl: './hub-sheet.scss',
})
export class HubInviteSheet {
  private hubService = inject(SquadHubService);

  squad = input.required<SquadModel>();
  closed = output<void>();

  protected readonly sent = signal<string[]>([]);
  protected readonly isSending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected send(player: PlayerOption): void {
    if (this.isSending()) {
      return;
    }
    this.error.set(null);
    this.isSending.set(true);
    this.hubService
      .invite(this.squad().id, player.username)
      .pipe(finalize(() => this.isSending.set(false)))
      .subscribe({
        next: (invite) => this.sent.update((list) => [...list, invite.inviteeUsername]),
        // e.g. "already in the squad" / "invite already pending" — the server's message says which.
        error: (err) => this.error.set(extractApiErrorMessage(err, `Could not invite ${player.username}.`)),
      });
  }
}
