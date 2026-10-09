import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InboxStore } from '../inbox.store';
import { AuthService } from '../../../services/auth/auth.service';
import { Conversation } from '../../../models/direct-message.model';
import { ImgFallback } from '../../../shared/img-fallback/img-fallback';
import { LoadError } from '../../../shared/load-error/load-error';
import { formatTimeAgo } from '../../../shared/clip-format';

/** Left column of /messages (the whole screen on phones until a conversation is picked). */
@Component({
  selector: 'app-conversation-list',
  imports: [RouterLink, ImgFallback, LoadError],
  templateUrl: './conversation-list.html',
  styleUrl: './conversation-list.scss',
})
export class ConversationList {
  protected readonly store = inject(InboxStore);
  private auth = inject(AuthService);

  readonly activeId = input<string | null>(null);

  protected preview(c: Conversation): string {
    if (!c.lastMessage) {
      return '';
    }
    const mine = c.lastMessage.senderId === this.auth.currentUser()?.id;
    return (mine ? 'You: ' : '') + c.lastMessage.body;
  }

  protected ago(c: Conversation): string {
    return c.lastMessage ? formatTimeAgo(c.lastMessage.createdAt) : '';
  }
}
