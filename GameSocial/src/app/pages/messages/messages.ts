import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { InboxStore } from './inbox.store';
import { ConversationList } from './conversation-list/conversation-list';
import { MessageThread } from './message-thread/message-thread';

/**
 * `/messages` and `/messages/:conversationId` — conversation list + open thread side by side. On phones it's a
 * two-step view: the list alone, then the thread full screen (that child route is `immersive`).
 * The child routes have no component; this page reads the id itself so the list isn't rebuilt per thread.
 */
@Component({
  selector: 'app-messages',
  imports: [ConversationList, MessageThread],
  providers: [InboxStore],
  template: `
    <div class="dm-page" [class.has-thread]="!!conversationId()">
      <app-conversation-list class="dm-list" [activeId]="conversationId()" />
      <section class="dm-thread" aria-label="Conversation">
        @if (conversationId(); as id) {
          <app-message-thread [conversationId]="id" (back)="backToList()" />
        } @else {
          <p class="dm-placeholder">Pick a conversation, or start one from someone's profile.</p>
        }
      </section>
    </div>
  `,
  styleUrl: './messages.scss',
})
export class Messages {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private store = inject(InboxStore);

  protected readonly conversationId = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      // `snapshot` is still undefined on the child while this page is being created mid-navigation (e.g. coming
      // from a profile's "Message"); an error here would kill the signal, so read it defensively.
      map(() => this.route.firstChild?.snapshot?.paramMap.get('conversationId') ?? null),
    ),
    { initialValue: null },
  );

  constructor() {
    this.store.load(true);
  }

  protected backToList(): void {
    void this.router.navigate(['/messages']);
  }
}
