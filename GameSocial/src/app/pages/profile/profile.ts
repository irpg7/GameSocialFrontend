import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import { UserProfileService } from '../../services/user-profile/user-profile.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { UserProfileModel } from '../../models/user-profile.model';

/**
 * Public profile page for any user, reached via /profile/:id (own or someone
 * else's — see UserProfileModel.isCurrentUser for the follow-button gating).
 * Re-subscribes to paramMap rather than reading route.snapshot once, since
 * navigating from one profile straight to another (e.g. clicking a name
 * inside a follower list) reuses this component instance instead of
 * recreating it.
 */
@Component({
  selector: 'app-profile',
  imports: [RouterLink, DatePipe],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private route = inject(ActivatedRoute);
  private userProfileService = inject(UserProfileService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);

  protected readonly profile = signal<UserProfileModel | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly isTogglingFollow = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => this.loadProfile(params.get('id') ?? ''));
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
        error: () => this.notificationService.error('Failed to update follow status.'),
      });
  }

  private loadProfile(userId: string): void {
    this.isLoading.set(true);
    this.notFound.set(false);
    this.profile.set(null);
    this.userProfileService
      .getProfile(userId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => this.profile.set(profile),
        error: () => this.notFound.set(true),
      });
  }
}
