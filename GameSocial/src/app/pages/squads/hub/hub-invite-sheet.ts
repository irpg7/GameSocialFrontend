import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SquadModel } from '../../../models/squad.model';
import { SquadHubService } from '../../../services/squad/squad-hub.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SquadSheetFrame } from '../../../shared/squad-create-sheet/squad-sheet-frame';

/** "Invite" on a "Your squads" card — sends SquadInvites by username. */
@Component({
  selector: 'app-hub-invite-sheet',
  imports: [FormsModule, SquadSheetFrame],
  template: `
    <app-squad-sheet-frame
      [title]="'Invite to ' + squad().name"
      subtitle="They'll see it under Squad invites and can accept from there"
      [width]="460"
      (closed)="closed.emit()">
      <div class="hs-body">
        <div>
          <label class="hs-label" for="hub-invite-username">Username</label>
          <input
            id="hub-invite-username"
            class="hs-input"
            type="text"
            autocomplete="off"
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
            (keydown.enter)="$event.preventDefault(); send()"
            placeholder="tunaFPS" />
        </div>
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
        <button type="button" class="hs-cancel" (click)="closed.emit()">Done</button>
        <button type="button" class="hs-primary" [disabled]="isSending() || !username().trim()" (click)="send()">
          {{ isSending() ? 'Sending…' : 'Send invite' }}
        </button>
      </div>
    </app-squad-sheet-frame>
  `,
  styleUrl: './hub-sheet.scss',
})
export class HubInviteSheet {
  private hubService = inject(SquadHubService);

  squad = input.required<SquadModel>();
  closed = output<void>();

  protected readonly username = signal('');
  protected readonly sent = signal<string[]>([]);
  protected readonly isSending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected send(): void {
    const username = this.username().trim().replace(/^@/, '');
    if (!username || this.isSending()) {
      return;
    }
    this.error.set(null);
    this.isSending.set(true);
    this.hubService
      .invite(this.squad().id, username)
      .pipe(finalize(() => this.isSending.set(false)))
      .subscribe({
        next: (invite) => {
          this.sent.update((list) => [...list, invite.inviteeUsername]);
          this.username.set('');
        },
        error: (err) => this.error.set(extractApiErrorMessage(err, 'Could not send the invite.')),
      });
  }
}
