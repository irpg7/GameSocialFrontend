import { Component, computed, input, output, signal } from '@angular/core';
import { SquadLeaderboardEntryModel, SquadMemberModel } from '../../../../models/squad.model';
import { BottomSheet } from '../../../../shared/bottom-sheet/bottom-sheet';
import { SquadRail } from '../squad-rail/squad-rail';

type MembersTab = 'roster' | 'board';

/**
 * Phone "Üyeler" sheet (prototype "Oda · üyeler"): the desktop right rail's two panels — Roster and
 * This week's board — behind a two-way tab, opened from the room header's members button.
 */
@Component({
  selector: 'app-squad-members-sheet',
  imports: [BottomSheet, SquadRail],
  template: `
    <app-bottom-sheet title="Üyeler" [tall]="true" (closed)="closed.emit()">
      <div class="ms-tabs" role="tablist" aria-label="Üyeler bölümleri">
        <button
          type="button"
          role="tab"
          class="ms-tab"
          id="ms-tab-roster"
          aria-controls="ms-panel"
          [class.active]="tab() === 'roster'"
          [attr.aria-selected]="tab() === 'roster'"
          (click)="tab.set('roster')">
          Roster <span class="ms-online mono">{{ onlineCount() }} online</span>
        </button>
        <button
          type="button"
          role="tab"
          class="ms-tab"
          id="ms-tab-board"
          aria-controls="ms-panel"
          [class.active]="tab() === 'board'"
          [attr.aria-selected]="tab() === 'board'"
          (click)="tab.set('board')">
          This week's board
        </button>
      </div>
      <div id="ms-panel" role="tabpanel" [attr.aria-labelledby]="'ms-tab-' + tab()">
        <app-squad-rail
          [section]="tab()"
          [roster]="roster()"
          [leaderboard]="leaderboard()"
          [currentUserId]="currentUserId()"
          [rosterError]="rosterError()"
          [leaderboardError]="leaderboardError()"
          (invite)="invite.emit()" />
      </div>
    </app-bottom-sheet>
  `,
  styleUrl: './squad-members-sheet.scss',
})
export class SquadMembersSheet {
  roster = input.required<SquadMemberModel[]>();
  leaderboard = input.required<SquadLeaderboardEntryModel[]>();
  currentUserId = input<string | undefined>(undefined);
  rosterError = input<string | null>(null);
  leaderboardError = input<string | null>(null);

  invite = output<void>();
  closed = output<void>();

  protected readonly tab = signal<MembersTab>('roster');

  protected readonly onlineCount = computed(
    () => this.roster().filter((member) => member.presence && member.presence !== 'offline').length,
  );
}
