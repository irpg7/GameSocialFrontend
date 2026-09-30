import { Component, computed, input, output } from '@angular/core';
import { SquadModel } from '../../../models/squad.model';
import { discoverMeta, initialOf } from './hub-format';

/**
 * "Squads looking for you" card (expl.html 2a): 42px icon, name, members +
 * open slots, description, and a wide "Join" / "Ask to join" next to "Peek".
 */
@Component({
  selector: 'app-hub-discover-card',
  template: `
    <article class="discover">
      <div class="discover-head">
        <span class="discover-icon" aria-hidden="true">
          @if (squad().iconUrl; as icon) {
            <img [src]="icon" alt="" />
          } @else {
            {{ initial() }}
          }
        </span>
        <div class="discover-id">
          <h3 class="discover-name">{{ squad().name }}</h3>
          <div class="discover-meta">{{ meta() }}</div>
        </div>
      </div>
      @if (squad().description) {
        <p class="discover-desc">{{ squad().description }}</p>
      }
      <div class="discover-actions">
        <button type="button" class="discover-join" [disabled]="busy() || requested() || full()" (click)="join.emit()">
          {{ joinLabel() }}
        </button>
        <button type="button" class="discover-peek" [attr.aria-label]="'Peek at ' + squad().name" (click)="peek.emit()">Peek</button>
      </div>
    </article>
  `,
  styleUrl: './hub-discover-card.scss',
})
export class HubDiscoverCard {
  squad = input.required<SquadModel>();
  requested = input(false);
  busy = input(false);
  join = output<void>();
  peek = output<void>();

  protected readonly initial = computed(() => initialOf(this.squad().name));
  protected readonly meta = computed(() => discoverMeta(this.squad()));
  protected readonly full = computed(() => this.squad().openSlots <= 0);
  protected readonly joinLabel = computed(() => {
    if (this.requested()) return 'Requested';
    if (this.full()) return 'Full';
    return this.squad().joinPolicy === 'Open' ? 'Join' : 'Ask to join';
  });
}
