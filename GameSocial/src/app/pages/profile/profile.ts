import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { EMPTY, catchError, finalize, map, switchMap, tap } from 'rxjs';
import { UserProfileService } from '../../services/user-profile/user-profile.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { UserProfileModel } from '../../models/user-profile.model';
import { TrophyTile } from '../../shared/trophy-tile/trophy-tile';
import { rarestId } from '../../shared/trophy-tile/trophy-format';
import { LoadError } from '../../shared/load-error/load-error';
import { ImgFallback } from '../../shared/img-fallback/img-fallback';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { BlockService } from '../../services/safety/block.service';
import { ReportService } from '../../services/safety/report.service';
import { DirectMessageService } from '../../services/direct-message/direct-message.service';

/**
 * Public profile page for any user, reached via /profile/:id (own or someone
 * else's — see UserProfileModel.isCurrentUser for the follow-button gating).
 * Follows paramMap rather than reading route.snapshot once, since
 * navigating from one profile straight to another (e.g. clicking a name
 * inside a follower list) reuses this component instance instead of
 * recreating it. `switchMap` drops the older profile's response, so a slow
 * request can't overwrite the newer one.
 */
@Component({
  selector: 'app-profile',
  imports: [RouterLink, DatePipe, TrophyTile, LoadError, ImgFallback],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  host: {
    '(document:click)': 'menuOpen.set(false); confirmingBlock.set(false)',
  },
})
export class Profile {
  private route = inject(ActivatedRoute);
  private userProfileService = inject(UserProfileService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private blockService = inject(BlockService);
  private reportService = inject(ReportService);
  private directMessages = inject(DirectMessageService);
  private router = inject(Router);

  protected readonly isOpeningChat = signal(false);

  protected readonly profile = signal<UserProfileModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);
  /** Any other failure (server error, offline) — shown with a retry instead of "User not found". */
  protected readonly loadError = signal<string | null>(null);
  protected readonly isTogglingFollow = signal(false);
  /** ··· menu next to Follow: report / block. */
  protected readonly menuOpen = signal(false);
  protected readonly confirmingBlock = signal(false);
  protected readonly isBlocking = signal(false);
  /** The one showcase tile the design lights red: the rarest pinned trophy. */
  protected readonly showcaseAccentId = computed(() => rarestId(this.profile()?.showcase ?? []));

  private userId = '';

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        tap((userId) => {
          this.userId = userId;
          this.isLoading.set(true);
          this.notFound.set(false);
          this.loadError.set(null);
          this.profile.set(null);
        }),
        switchMap((userId) =>
          this.userProfileService.getProfile(userId).pipe(
            catchError((err: unknown) => {
              if (err instanceof HttpErrorResponse && (err.status === 404 || err.status === 400)) {
                this.notFound.set(true);
              } else {
                this.loadError.set(extractApiErrorMessage(err, 'Could not load this profile.'));
              }
              this.isLoading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((profile) => {
        this.profile.set(profile);
        this.isLoading.set(false);
      });
  }

  protected retry(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.userProfileService
      .getProfile(this.userId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => this.profile.set(profile),
        error: (err: unknown) => this.loadError.set(extractApiErrorMessage(err, 'Could not load this profile.')),
      });
  }

  toggleFollow(): void {
    const profile = this.profile();
    if (!profile || this.isTogglingFollow()) {
      return;
    }
    this.isTogglingFollow.set(true);
    this.followService
      .toggleUserFollow(profile.id)
      .pipe(finalize(() => this.isTogglingFollow.set(false)))
      .subscribe({
        next: (result) =>
          this.profile.update((current) =>
            current
              ? {
                  ...current,
                  isFollowedByCurrentUser: result.following,
                  followersCount: current.followersCount + (result.following ? 1 : -1),
                }
              : current,
          ),
        error: (err: unknown) =>
          this.notificationService.error(extractApiErrorMessage(err, 'Failed to update follow status.')),
      });
  }

  /** Opens (or creates) the DM conversation and goes there. The button only shows when the server says I may. */
  protected message(): void {
    const profile = this.profile();
    if (!profile || this.isOpeningChat()) {
      return;
    }
    this.isOpeningChat.set(true);
    this.directMessages
      .open(profile.id)
      .pipe(finalize(() => this.isOpeningChat.set(false)))
      .subscribe({
        next: (conversation) => void this.router.navigate(['/messages', conversation.id]),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Could not open a conversation.')),
      });
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
    this.confirmingBlock.set(false);
  }

  protected reportUser(): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }
    this.menuOpen.set(false);
    this.reportService.open({ type: 'User', id: profile.id, label: `@${profile.username}` });
  }

  /** First click arms it, second click blocks; the page then shows the "unavailable" state. */
  protected block(): void {
    const profile = this.profile();
    if (!profile || this.isBlocking()) {
      return;
    }
    if (!this.confirmingBlock()) {
      this.confirmingBlock.set(true);
      return;
    }
    this.isBlocking.set(true);
    this.blockService
      .block(profile.id)
      .pipe(finalize(() => this.isBlocking.set(false)))
      .subscribe({
        next: () => {
          this.menuOpen.set(false);
          this.notificationService.success(`Blocked @${profile.username}.`);
          this.retry();
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Could not block this user.')),
      });
  }

  protected unblock(): void {
    const profile = this.profile();
    if (!profile || this.isBlocking()) {
      return;
    }
    this.isBlocking.set(true);
    this.blockService
      .unblock(profile.id)
      .pipe(finalize(() => this.isBlocking.set(false)))
      .subscribe({
        next: () => {
          this.notificationService.success(`Unblocked @${profile.username}.`);
          this.retry();
        },
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Could not unblock this user.')),
      });
  }

}
