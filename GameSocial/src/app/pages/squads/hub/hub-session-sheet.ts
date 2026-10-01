import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SquadModel } from '../../../models/squad.model';
import { SquadSessionModel } from '../../../models/squad-hub.model';
import { SquadHubService } from '../../../services/squad/squad-hub.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { SquadSheetFrame } from '../../../shared/squad-create-sheet/squad-sheet-frame';

/**
 * Starts a voice session from the squad room's "Sesli sohbet" list — live
 * now ("co-op · needs a healer") or scheduled ("time trial night, 21:00").
 */
@Component({
  selector: 'app-hub-session-sheet',
  imports: [FormsModule, SquadSheetFrame],
  template: `
    <app-squad-sheet-frame title="Start a session" [subtitle]="'Get ' + squad().name + ' together — live now or later today'" [width]="520" (closed)="closed.emit()">
      <div class="hs-body">
        <div>
          <label class="hs-label" for="session-game">Game</label>
          <select id="session-game" class="hs-input" [ngModel]="gameId()" (ngModelChange)="gameId.set($event)">
            <option [ngValue]="null">No game</option>
            @for (game of games(); track game.id) {
              <option [ngValue]="game.id">{{ game.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="hs-label" for="session-title">What's the plan?</label>
          <input id="session-title" class="hs-input" type="text" maxlength="80" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="co-op" />
        </div>
        <div>
          <label class="hs-label" for="session-note">Note</label>
          <input id="session-note" class="hs-input" type="text" maxlength="120" [ngModel]="note()" (ngModelChange)="note.set($event)" placeholder="needs a healer" />
        </div>
        <div class="hs-toggle" role="group" aria-label="When">
          <button type="button" [class.on]="isLive()" [attr.aria-pressed]="isLive()" (click)="isLive.set(true)">Live now</button>
          <button type="button" [class.on]="!isLive()" [attr.aria-pressed]="!isLive()" (click)="isLive.set(false)">Schedule</button>
        </div>
        <div class="hs-row">
          @if (!isLive()) {
            <div>
              <label class="hs-label" for="session-start">Starts at</label>
              <input id="session-start" class="hs-input" type="datetime-local" [ngModel]="startsAt()" (ngModelChange)="startsAt.set($event)" />
            </div>
          }
          <div>
            <label class="hs-label" for="session-capacity">Spots</label>
            <input id="session-capacity" class="hs-input" type="number" min="2" max="32" [ngModel]="capacity()" (ngModelChange)="capacity.set(+$event)" />
          </div>
        </div>
        @if (error(); as message) {
          <p class="hs-error" role="alert">{{ message }}</p>
        }
      </div>
      <div class="hs-footer">
        <button type="button" class="hs-cancel" (click)="closed.emit()">Cancel</button>
        <button type="button" class="hs-primary" [disabled]="isSaving() || !title().trim()" (click)="submit()">
          {{ isSaving() ? 'Starting…' : isLive() ? 'Go live' : 'Schedule' }}
        </button>
      </div>
    </app-squad-sheet-frame>
  `,
  styleUrl: './hub-sheet.scss',
})
export class HubSessionSheet {
  private hubService = inject(SquadHubService);

  squad = input.required<SquadModel>();
  created = output<SquadSessionModel>();
  closed = output<void>();

  protected readonly games = computed(() => this.squad().games);
  protected readonly gameId = linkedSignal<number | null>(() => this.games()[0]?.id ?? null);
  protected readonly title = signal('');
  protected readonly note = signal('');
  protected readonly isLive = signal(true);
  protected readonly startsAt = signal('');
  protected readonly capacity = signal(4);
  protected readonly isSaving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    const squadId = this.squad().id;
    if (!this.title().trim()) {
      return;
    }
    let startsAt: string | undefined;
    if (!this.isLive()) {
      if (!this.startsAt()) {
        this.error.set('Pick when it starts.');
        return;
      }
      startsAt = new Date(this.startsAt()).toISOString();
    }
    this.error.set(null);
    this.isSaving.set(true);
    this.hubService
      .createSession(squadId, {
        title: this.title().trim(),
        note: this.note().trim() || undefined,
        gameId: this.gameId() ?? undefined,
        startsAt,
        isLive: this.isLive(),
        capacity: this.capacity(),
      })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (session) => this.created.emit(session),
        error: (err) => this.error.set(extractApiErrorMessage(err, 'Could not start the session.')),
      });
  }
}
