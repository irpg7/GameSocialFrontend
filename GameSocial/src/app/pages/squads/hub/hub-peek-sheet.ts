import { Component, computed, input, output } from '@angular/core';
import { SquadModel } from '../../../models/squad.model';
import { SquadSheetFrame } from '../../../shared/squad-create-sheet/squad-sheet-frame';
import { discoverMeta, formatNumber, levelPercent } from './hub-format';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';

/** "Peek" — a non-member-safe preview of a discoverable squad (GET squads/{id}). */
@Component({
  selector: 'app-hub-peek-sheet',
  imports: [ImgFallback, SquadSheetFrame],
  template: `
    <app-squad-sheet-frame [title]="squad().name" [subtitle]="meta()" [width]="520" (closed)="closed.emit()">
      <span sheet-icon class="hs-icon" aria-hidden="true">
        <img [appImg]="squad().iconUrl" fallback="squad" alt="" />
      </span>
      <div class="hs-body">
        @if (squad().description) {
          <p class="hs-note">{{ squad().description }}</p>
        }
        @if (squad().games.length > 0) {
          <div>
            <div class="hs-label">Plays</div>
            <div class="hs-chips">
              @for (game of squad().games; track game.id) {
                <span>{{ game.name }}</span>
              }
            </div>
          </div>
        }
        <div>
          <div class="hs-level-row"><span>SQUAD LEVEL {{ squad().level }}</span><span>{{ xpLabel() }}</span></div>
          <div class="hs-level-track"><span [style.width.%]="percent()"></span></div>
        </div>
        <p class="hs-note">{{ policyNote() }} · {{ squad().onlineCount }} online now</p>
      </div>
      <div class="hs-footer">
        <button type="button" class="hs-cancel" (click)="closed.emit()">Close</button>
        <button type="button" class="hs-primary" [disabled]="busy() || requested() || squad().openSlots <= 0" (click)="join.emit()">
          {{ joinLabel() }}
        </button>
      </div>
    </app-squad-sheet-frame>
  `,
  styleUrl: './hub-sheet.scss',
})
export class HubPeekSheet {
  squad = input.required<SquadModel>();
  requested = input(false);
  busy = input(false);
  join = output<void>();
  closed = output<void>();

  protected readonly meta = computed(() => discoverMeta(this.squad()));
  protected readonly percent = computed(() => levelPercent(this.squad()));
  protected readonly xpLabel = computed(
    () => `${formatNumber(this.squad().xp)} / ${formatNumber(this.squad().xpForNextLevel)}`,
  );
  protected readonly policyNote = computed(() =>
    this.squad().joinPolicy === 'Open' ? 'Anyone can walk in' : 'Requests go to the founder and admins',
  );
  protected readonly joinLabel = computed(() => {
    if (this.requested()) return 'Requested';
    if (this.squad().openSlots <= 0) return 'Full';
    return this.squad().joinPolicy === 'Open' ? 'Join' : 'Ask to join';
  });
}
