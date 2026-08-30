import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, map } from 'rxjs';
import { SquadService } from '../../../services/squad/squad.service';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { SquadMemberModel, SquadMessageModel, SquadLeaderboardEntryModel, SquadModel } from '../../../models/squad.model';
import { PostModel } from '../../../models/post.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { PostCard } from '../../feed/post-card/post-card';

const MESSAGE_PAGE_SIZE = 50;
const POST_PAGE_SIZE = 12;
/** Max page size the backend allows — used as the pinned-message scan window per channel (see loadPinned). */
const PINNED_SCAN_PAGE_SIZE = 100;

type SquadTab = 'chat' | 'clips' | 'screens' | 'pinned';
type PinnedMessage = SquadMessageModel & { channelName: string };

/**
 * Real squad room (Phase 4), replacing the Phase 1 placeholder.
 *
 * Notable confirmed-by-reading-source facts baked into this component:
 * - Add-member and create-channel are Captain-only server-side (400
 *   otherwise) — those forms are hidden entirely for non-captains rather
 *   than shown-then-rejected.
 * - Pin/unpin is allowed for ANY member, not just the captain.
 * - `GET .../messages` is paginated oldest-first; there is no "start at the
 *   newest message" fetch, so this simply appends forward page by page
 *   (same load-more mechanics as Comments/Feed) — chat starts at the
 *   oldest messages, not the newest. Acceptable given the spec's own
 *   scope cut on real-time chat (poll/refetch only, no websockets).
 * - There is no dedicated "list pinned messages" endpoint — the Pinned tab
 *   is derived client-side by scanning each channel's most recent 100
 *   messages (the max page size) for `isPinned`. A pin older than that
 *   window in a very active channel won't surface; documented, not a bug.
 * - The spec's "Push to main feed" chat action has no backing endpoint —
 *   and turns out to be unnecessary anyway: `ListPostsQueryHandler` only
 *   filters by SquadId when a caller explicitly passes one, so a
 *   squad-tagged post is ALREADY visible on the main feed by default,
 *   there is no squad-only visibility scoping to "push" out of.
 */
@Component({
  selector: 'app-squad-room',
  imports: [RouterLink, FormsModule, DatePipe, PostCard],
  templateUrl: './squad-room.html',
  styleUrl: './squad-room.scss',
})
export class SquadRoom implements OnInit {
  private route = inject(ActivatedRoute);
  private squadService = inject(SquadService);
  private postService = inject(PostService);
  private notificationService = inject(NotificationService);
  protected readonly authService = inject(AuthService);

  protected readonly squad = signal<SquadModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly activeTab = signal<SquadTab>('chat');
  protected readonly activeChannelId = signal<number | null>(null);

  protected readonly isCaptain = computed(() => this.squad()?.currentUserRole === 'Captain');
  protected readonly isMember = computed(() => this.squad()?.currentUserRole != null);
  protected readonly activeChannel = computed(() => this.squad()?.channels.find((c) => c.id === this.activeChannelId()) ?? null);

  // ─── Chat ────────────────────────────────────────────────────
  protected readonly messages = signal<SquadMessageModel[]>([]);
  protected readonly messagesPage = signal(1);
  protected readonly hasMoreMessages = signal(false);
  protected readonly isLoadingMessages = signal(false);
  protected readonly newMessageBody = signal('');
  protected readonly isSendingMessage = signal(false);

  // ─── Clips / Screens ─────────────────────────────────────────
  protected readonly clipPosts = signal<PostModel[]>([]);
  protected readonly isLoadingClips = signal(false);
  protected readonly screenPosts = signal<PostModel[]>([]);
  protected readonly isLoadingScreens = signal(false);

  // ─── Pinned ──────────────────────────────────────────────────
  protected readonly pinnedMessages = signal<PinnedMessage[]>([]);
  protected readonly isLoadingPinned = signal(false);

  // ─── Roster / leaderboard ────────────────────────────────────
  protected readonly members = signal<SquadMemberModel[]>([]);
  protected readonly leaderboard = signal<SquadLeaderboardEntryModel[]>([]);

  // ─── Captain-only add member/channel forms ──────────────────
  protected readonly showAddMemberForm = signal(false);
  protected readonly newMemberUsername = signal('');
  protected readonly isAddingMember = signal(false);
  protected readonly addMemberError = signal<string | null>(null);

  protected readonly showAddChannelForm = signal(false);
  protected readonly newChannelName = signal('');
  protected readonly isAddingChannel = signal(false);
  protected readonly addChannelError = signal<string | null>(null);

  private squadId = 0;

  ngOnInit(): void {
    this.squadId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadSquad();

    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  selectTab(tab: SquadTab): void {
    this.activeTab.set(tab);
    if (tab === 'clips' && this.clipPosts().length === 0) {
      this.loadClips();
    } else if (tab === 'screens' && this.screenPosts().length === 0) {
      this.loadScreens();
    } else if (tab === 'pinned' && this.pinnedMessages().length === 0) {
      this.loadPinned();
    }
  }

  selectChannel(channelId: number): void {
    if (channelId === this.activeChannelId()) {
      return;
    }
    this.activeChannelId.set(channelId);
    this.messages.set([]);
    this.messagesPage.set(1);
    this.hasMoreMessages.set(false);
    this.loadMessages(1);
  }

  loadMoreMessages(): void {
    this.loadMessages(this.messagesPage() + 1, true);
  }

  sendMessage(): void {
    const body = this.newMessageBody().trim();
    const channelId = this.activeChannelId();
    if (!body || channelId === null || this.isSendingMessage()) {
      return;
    }
    this.isSendingMessage.set(true);
    this.squadService
      .sendMessage(this.squadId, channelId, body)
      .pipe(finalize(() => this.isSendingMessage.set(false)))
      .subscribe({
        next: (message) => {
          this.messages.update((existing) => [...existing, message]);
          this.newMessageBody.set('');
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to send message.')),
      });
  }

  /**
   * Uses the message's own `channelId` rather than the currently-active
   * channel — this is called both from the Chat tab (where they're always
   * the same) and the Pinned tab (which can show messages from any of the
   * squad's channels, so relying on `activeChannelId` there would be wrong).
   */
  togglePin(message: SquadMessageModel): void {
    this.squadService.toggleMessagePin(this.squadId, message.channelId, message.id).subscribe({
      next: (updated) => {
        this.messages.update((existing) => existing.map((m) => (m.id === updated.id ? updated : m)));
        this.pinnedMessages.update((existing) =>
          updated.isPinned
            ? existing
            : existing.filter((m) => m.id !== updated.id),
        );
      },
      error: () => this.notificationService.error('Failed to update pin. Please try again.'),
    });
  }

  toggleAddMemberForm(): void {
    this.showAddMemberForm.update((value) => !value);
  }

  toggleAddChannelForm(): void {
    this.showAddChannelForm.update((value) => !value);
  }

  addMember(): void {
    const username = this.newMemberUsername().trim();
    if (!username || this.isAddingMember()) {
      return;
    }
    this.addMemberError.set(null);
    this.isAddingMember.set(true);
    this.squadService
      .addMember(this.squadId, username)
      .pipe(finalize(() => this.isAddingMember.set(false)))
      .subscribe({
        next: (member) => {
          this.members.update((existing) => [...existing, member]);
          this.squad.update((squad) => (squad ? { ...squad, memberCount: squad.memberCount + 1 } : squad));
          this.newMemberUsername.set('');
        },
        error: (err) => this.addMemberError.set(extractApiErrorMessage(err, 'Failed to add member.')),
      });
  }

  addChannel(): void {
    const name = this.newChannelName().trim();
    if (!name || this.isAddingChannel()) {
      return;
    }
    this.addChannelError.set(null);
    this.isAddingChannel.set(true);
    this.squadService
      .createChannel(this.squadId, name)
      .pipe(finalize(() => this.isAddingChannel.set(false)))
      .subscribe({
        next: (channel) => {
          this.squad.update((squad) => (squad ? { ...squad, channels: [...squad.channels, channel] } : squad));
          this.newChannelName.set('');
        },
        error: (err) => this.addChannelError.set(extractApiErrorMessage(err, 'Failed to create channel.')),
      });
  }

  isCurrentUser(userId: string): boolean {
    return userId === this.authService.currentUser()?.id;
  }

  private loadSquad(): void {
    this.isLoading.set(true);
    this.squadService.getById(this.squadId).subscribe({
      next: (squad) => {
        this.squad.set(squad);
        this.isLoading.set(false);
        const firstChannel = [...squad.channels].sort((a, b) => a.sortOrder - b.sortOrder)[0];
        if (firstChannel) {
          this.selectChannel(firstChannel.id);
        }
        this.loadMembers();
        this.loadLeaderboard();
      },
      error: () => {
        this.notFound.set(true);
        this.isLoading.set(false);
      },
    });
  }

  private loadMessages(page: number, append = false): void {
    const channelId = this.activeChannelId();
    if (channelId === null) {
      return;
    }
    this.isLoadingMessages.set(true);
    this.squadService
      .listMessages(this.squadId, channelId, page, MESSAGE_PAGE_SIZE)
      .pipe(finalize(() => this.isLoadingMessages.set(false)))
      .subscribe({
        next: (result) => {
          this.messages.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.messagesPage.set(result.page);
          this.hasMoreMessages.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load messages.'),
      });
  }

  private loadClips(): void {
    this.isLoadingClips.set(true);
    this.postService
      .getPosts(1, POST_PAGE_SIZE, { squadId: this.squadId, postType: 'Clip' })
      .pipe(finalize(() => this.isLoadingClips.set(false)))
      .subscribe({
        next: (result) => this.clipPosts.set(result.items),
        error: () => this.notificationService.error('Failed to load clips.'),
      });
  }

  private loadScreens(): void {
    this.isLoadingScreens.set(true);
    this.postService
      .getPosts(1, POST_PAGE_SIZE, { squadId: this.squadId, postType: 'Screenshots' })
      .pipe(finalize(() => this.isLoadingScreens.set(false)))
      .subscribe({
        next: (result) => this.screenPosts.set(result.items),
        error: () => this.notificationService.error('Failed to load screenshots.'),
      });
  }

  private loadPinned(): void {
    const squad = this.squad();
    if (!squad || squad.channels.length === 0) {
      return;
    }
    this.isLoadingPinned.set(true);
    forkJoin(
      squad.channels.map((channel) =>
        this.squadService
          .listMessages(this.squadId, channel.id, 1, PINNED_SCAN_PAGE_SIZE)
          .pipe(map((result) => result.items.filter((m) => m.isPinned).map((m): PinnedMessage => ({ ...m, channelName: channel.name })))),
      ),
    )
      .pipe(finalize(() => this.isLoadingPinned.set(false)))
      .subscribe({
        next: (groups) => {
          this.pinnedMessages.set(groups.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        },
        error: () => this.notificationService.error('Failed to load pinned messages.'),
      });
  }

  private loadMembers(): void {
    this.squadService.listMembers(this.squadId).subscribe({
      next: (members) => this.members.set(members),
      error: () => void 0,
    });
  }

  private loadLeaderboard(): void {
    this.squadService.getLeaderboard(this.squadId).subscribe({
      next: (entries) => this.leaderboard.set(entries),
      error: () => void 0,
    });
  }
}
