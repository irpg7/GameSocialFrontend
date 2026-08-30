import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PostModel } from '../../models/post.model';
import { PostCard } from '../feed/post-card/post-card';

const PAGE_SIZE = 12;

/**
 * Real Clips page (Phase 3), replacing the Phase 1 placeholder.
 *
 * Deliberate simplification vs. the mock's hero+queue+grid layout: a
 * "Clip of the Day"/"Hot today" ranking would need to be computed either
 * from a real backend aggregate (doesn't exist) or from whatever page
 * happens to be loaded client-side — the latter would silently mislabel a
 * partial, arbitrary sample as "today's most-liked", which is the same
 * accuracy problem the Reviews page's aggregate-score card ran into. A
 * plain newest-first Clip-only feed (reusing the same load-more pattern as
 * the main Feed) is the honest option; "Following" is a real client-side
 * filter since that data is already cheap to fetch. "Hot today"/"New" sort
 * chips are omitted for the same reason — GET /api/posts has no alternate
 * sort order to back them.
 */
@Component({
  selector: 'app-clips',
  imports: [PostCard],
  templateUrl: './clips.html',
  styleUrl: './clips.scss',
})
export class Clips implements OnInit {
  private postService = inject(PostService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);

  protected readonly posts = signal<PostModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);

  protected readonly followedUserIds = signal<Set<string>>(new Set());
  protected readonly followingOnly = signal(false);

  protected readonly filteredPosts = computed(() => {
    if (!this.followingOnly()) {
      return this.posts();
    }
    return this.posts().filter((post) => this.followedUserIds().has(post.userId));
  });

  ngOnInit(): void {
    this.loadPosts(1);

    this.followService.getFollowedUsers().subscribe({
      next: (users) => this.followedUserIds.set(new Set(users.map((u) => u.userId))),
      error: () => void 0,
    });
  }

  toggleFollowingOnly(): void {
    this.followingOnly.update((value) => !value);
  }

  loadMore(): void {
    this.loadPosts(this.page() + 1, true);
  }

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    loadingSignal.set(true);
    this.postService
      .getPosts(page, PAGE_SIZE, { postType: 'Clip' })
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load clips.'),
      });
  }
}
