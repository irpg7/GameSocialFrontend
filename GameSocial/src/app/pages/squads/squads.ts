import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { SquadService } from '../../services/squad/squad.service';
import { SquadModel } from '../../models/squad.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { SquadCreateSheet } from '../../shared/squad-create-sheet/squad-create-sheet';
import { LAST_SQUAD_ID_KEY, readLastSquadId } from './last-squad-id';

/**
 * `/squads` entry point — NOT a list screen.
 *
 * The design has no squads index at all: Gamer Feed.dc.html's `goSquads` goes
 * straight to the `onSquad` state (the squad room), and switching squads plus
 * "＋ New squad" live in that room's left sidebar. So this route just resolves
 * *which* room to open and redirects into it.
 *
 * The one thing it renders itself is the zero-squads welcome state, which the
 * design has no artboard for because it assumes you are already in a squad.
 */
@Component({
  selector: 'app-squads',
  imports: [SquadCreateSheet],
  templateUrl: './squads.html',
  styleUrl: './squads.scss',
})
export class Squads implements OnInit {
  private squadService = inject(SquadService);
  private router = inject(Router);

  protected readonly isLoading = signal(true);
  /** Only ever true when the user has no squads — otherwise we redirect. */
  protected readonly showWelcome = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly isCreateSheetOpen = signal(false);

  ngOnInit(): void {
    this.resolveTargetSquad();
  }

  openCreateSheet(): void {
    this.isCreateSheetOpen.set(true);
  }

  closeCreateSheet(): void {
    this.isCreateSheetOpen.set(false);
  }

  onCreated(squad: SquadModel): void {
    this.isCreateSheetOpen.set(false);
    this.router.navigate(['/squads', squad.id]);
  }

  retry(): void {
    this.resolveTargetSquad();
  }

  private resolveTargetSquad(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.showWelcome.set(false);

    this.squadService
      .getMine()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (squads) => {
          if (squads.length === 0) {
            this.showWelcome.set(true);
            // A squad the user has since left must not keep winning the redirect.
            localStorage.removeItem(LAST_SQUAD_ID_KEY);
            return;
          }

          // Prefer the room the user was last in, but only if they are still a
          // member of it; otherwise fall back to the first (name-ordered) squad.
          const lastId = readLastSquadId();
          const target = squads.find((squad) => squad.id === lastId) ?? squads[0];
          this.router.navigate(['/squads', target.id], { replaceUrl: true });
        },
        // Previously a failed load fell through to the empty state, which told
        // the user they had no squads when the request had simply failed.
        error: (err) => this.loadError.set(extractApiErrorMessage(err, 'Could not load your squads.')),
      });
  }
}
