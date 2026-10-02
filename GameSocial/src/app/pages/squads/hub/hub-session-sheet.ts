import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { FormField, form, max, maxLength, min, required, submit } from '@angular/forms/signals';
import { SelectControl } from '../../../shared/select-control';
import { firstValueFrom } from 'rxjs';
import { SquadModel } from '../../../models/squad.model';
import { SquadSessionModel } from '../../../models/squad-hub.model';
import { SquadHubService } from '../../../services/squad/squad-hub.service';
import { SERVER_ERROR, fieldError, serverError, submitError } from '../../../shared/form-errors';
import { SquadSheetFrame } from '../../../shared/squad-create-sheet/squad-sheet-frame';

/**
 * Starts a voice session from the squad room's "Sesli sohbet" list — live
 * now ("co-op · needs a healer") or scheduled ("time trial night, 21:00").
 */
@Component({
  selector: 'app-hub-session-sheet',
  imports: [FormField, SelectControl, SquadSheetFrame],
  template: `
    <app-squad-sheet-frame title="Start a session" [subtitle]="'Get ' + squad().name + ' together — live now or later today'" [width]="520" (closed)="closed.emit()">
      <div class="hs-body">
        <div>
          <label class="hs-label" for="session-game">Game</label>
          <select id="session-game" class="hs-input" [formField]="sessionForm.gameId">
            <button><selectedcontent></selectedcontent></button>
            <option value="">No game</option>
            @for (game of games(); track game.id) {
              <option [value]="'' + game.id">{{ game.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="hs-label" for="session-title">What's the plan?</label>
          <input id="session-title" class="hs-input" type="text" [formField]="sessionForm.title" placeholder="co-op" />
        </div>
        <div>
          <label class="hs-label" for="session-note">Note</label>
          <input id="session-note" class="hs-input" type="text" [formField]="sessionForm.note" placeholder="needs a healer" />
        </div>
        <div class="hs-toggle" role="group" aria-label="When">
          <button type="button" [class.on]="model().isLive" [attr.aria-pressed]="model().isLive" (click)="setLive(true)">Live now</button>
          <button type="button" [class.on]="!model().isLive" [attr.aria-pressed]="!model().isLive" (click)="setLive(false)">Schedule</button>
        </div>
        <div class="hs-row">
          @if (!model().isLive) {
            <div>
              <label class="hs-label" for="session-start">Starts at</label>
              <input id="session-start" class="hs-input" type="datetime-local" [formField]="sessionForm.startsAt" />
            </div>
          }
          <div>
            <label class="hs-label" for="session-capacity">Spots</label>
            <input id="session-capacity" class="hs-input" type="number" [formField]="sessionForm.capacity" />
            @if (fieldError(sessionForm.capacity()); as message) {
              <p class="hs-error" role="alert">{{ message }}</p>
            }
          </div>
        </div>
        @if (submitError(sessionForm()); as message) {
          <p class="hs-error" role="alert">{{ message }}</p>
        }
      </div>
      <div class="hs-footer">
        <button type="button" class="hs-cancel" (click)="closed.emit()">Cancel</button>
        <button type="button" class="hs-primary" [disabled]="sessionForm().submitting() || !model().title.trim()" (click)="save()">
          {{ sessionForm().submitting() ? 'Starting…' : model().isLive ? 'Go live' : 'Schedule' }}
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

  protected readonly submitError = submitError;
  protected readonly fieldError = fieldError;

  protected readonly games = computed(() => this.squad().games);

  /** gameId is the select's string value ('' = "No game"); it defaults to the squad's first game. */
  protected readonly model = linkedSignal(() => ({
    gameId: String(this.games()[0]?.id ?? ''),
    title: '',
    note: '',
    isLive: true,
    startsAt: '',
    capacity: 4,
  }));

  protected readonly sessionForm = form(
    this.model,
    (path) => {
      required(path.title);
      maxLength(path.title, 80);
      maxLength(path.note, 120);
      // Without a message an out-of-range value would block submit() silently.
      min(path.capacity, 2, { message: 'Spots must be between 2 and 32.' });
      max(path.capacity, 32, { message: 'Spots must be between 2 and 32.' });
    },
    {
      submission: {
        action: async () => {
          const value = this.model();
          let startsAt: string | undefined;
          if (!value.isLive) {
            if (!value.startsAt) {
              return { kind: SERVER_ERROR, message: 'Pick when it starts.' };
            }
            startsAt = new Date(value.startsAt).toISOString();
          }
          try {
            const session = await firstValueFrom(
              this.hubService.createSession(this.squad().id, {
                title: value.title.trim(),
                note: value.note.trim() || undefined,
                gameId: value.gameId ? Number(value.gameId) : undefined,
                startsAt,
                isLive: value.isLive,
                capacity: value.capacity,
              }),
            );
            this.created.emit(session);
            return undefined;
          } catch (err) {
            return serverError(err, 'Could not start the session.');
          }
        },
      },
    },
  );

  protected setLive(isLive: boolean): void {
    this.model.update((value) => ({ ...value, isLive }));
  }

  protected save(): void {
    if (!this.model().title.trim()) {
      return;
    }
    void submit(this.sessionForm);
  }
}
