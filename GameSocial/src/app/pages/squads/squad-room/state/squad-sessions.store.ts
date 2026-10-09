import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { SquadHubService } from '../../../../services/squad/squad-hub.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { SquadSessionModel } from '../../../../models/squad-hub.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { environment } from '../../../../../environments/environment';
import { SquadRoomStore } from './squad-room.store';

/**
 * The sidebar's voice sessions ("Sesli sohbet"). Off (environment.features.squadVoice) until voice
 * ships: then nothing is listed or polled. Members only (server-enforced). Provided by `SquadRoom`.
 */
@Injectable()
export class SquadSessionsStore {
  private hubService = inject(SquadHubService);
  private notificationService = inject(NotificationService);
  private room = inject(SquadRoomStore);

  readonly isEnabled = environment.features.squadVoice;
  readonly sessions = signal<SquadSessionModel[]>([]);
  readonly busySessionId = signal<string | null>(null);

  reset(): void {
    this.sessions.set([]);
    this.busySessionId.set(null);
  }

  load(): void {
    const squadId = this.room.squadId();
    if (!this.isEnabled || !squadId || !this.room.isMember()) {
      return;
    }
    // Polled with the presence heartbeat; a missed poll just keeps the previous list.
    this.hubService.getSquadSessions(squadId).subscribe({
      next: (sessions) => {
        if (squadId === this.room.squadId()) {
          this.sessions.set(sessions);
        }
      },
      error: () => void 0,
    });
  }

  /** Live: join / leave voice. Scheduled: "I'm in" RSVP. */
  toggle(session: SquadSessionModel): void {
    this.run(session, this.hubService.toggleRsvp(session.id), 'Sesli sohbet güncellenemedi.');
  }

  /** Host or founder/admin: a scheduled session goes live now. */
  startNow(session: SquadSessionModel): void {
    this.run(session, this.hubService.goLive(session.id), 'Oturum başlatılamadı.');
  }

  /** Host or founder/admin: ends it for everyone. */
  end(session: SquadSessionModel): void {
    this.run(session, this.hubService.endSession(session.id), 'Oturum bitirilemedi.');
  }

  private run(session: SquadSessionModel, action: Observable<unknown>, fallback: string): void {
    if (this.busySessionId()) {
      return;
    }
    this.busySessionId.set(session.id);
    action.pipe(finalize(() => this.busySessionId.set(null))).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, fallback)),
    });
  }
}
