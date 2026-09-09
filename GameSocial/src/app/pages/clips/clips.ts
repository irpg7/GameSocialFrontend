import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { FollowService } from '../../services/follow/follow.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PostModel } from '../../models/post.model';
import { ClipStage } from '../../shared/clip-stage/clip-stage';
import { ClipQueueCard } from './clip-queue-card/clip-queue-card';
import { ClipRailComments } from './clip-rail-comments/clip-rail-comments';

const PAGE_SIZE = 12;

export type ClipFilter = 'hot' | 'following' | 'new';
export type ClipRail = 'next' | 'comments';

/**
 * The Clips page from Gamer Feed.dc.html's `onClipsPage` state: heading and
 * upload action, filter chips with a count, then the hero player beside an
 * "Up next" / "Yorumlar" rail with an autoplay switch.
 *
 * Two notes on where the data stops short of the mock:
 *  - The mock's chips are "Hot today / Following / New" over a server that
 *    ranks clips. `GET /api/posts` has no alternate sort, so "Hot" sorts the
 *    clips already loaded by their real like counts (and the chip is labelled
 *    "Hot", not "Hot today", because the window is the loaded page, not a
 *    day), "New" is the server's own newest-first order, and "Following" is
 *    the same client-side filter the page already had. "New" stays the
 *    default so the first thing you see is the unmassaged server order.
 *  - The mock's count line reads "4,182 clips today"; this one reports how
 *    many clips are loaded out of the real total the API reports.
 */
@Component({
  selector: 'app-clips',
  imports: [RouterLink, ClipStage, ClipQueueCard, ClipRailComments],
  templateUrl: './clips.html',
  styleUrl: './clips.scss',
})
export class Clips implements OnInit {
  private postService = inject(PostService);
  private followService = inject(FollowService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);

  protected readonly posts = signal<PostModel[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);

  protected readonly followedUserIds = signal<Set<string>>(new Set());
  protected readonly filter = signal<ClipFilter>('new');
  protected readonly rail = signal<ClipRail>('next');
  protected readonly autoplay = signal(true);
  protected readonly selectedClipId = signal<string | null>(null);
  /** Local comment-count deltas from the rail composer, keyed by post id. */
  protected readonly commentDeltas = signal<Record<string, number>>({});

  protected readonly clips = computed(() => {
    const all = this.posts();
    switch (this.filter()) {
      case 'following':
        return all.filter((post) => this.followedUserIds().has(post.userId));
      case 'hot':
        return all.slice().sort((a, b) => b.likeCount - a.likeCount);
      default:
        return all;
    }
  });

  protected readonly hero = computed(() => {
    const list = this.clips();
    const selectedId = this.selectedClipId();
    return list.find((post) => post.id === selectedId) ?? list[0] ?? null;
  });

  protected readonly upNext = computed(() => {
    const heroId = this.hero()?.id;
    return this.clips().filter((post) => post.id !== heroId);
  });

  protected readonly heroRank = computed(() => {
    const hero = this.hero();
    if (!hero || this.filter() !== 'hot') {
      return 'CLIP';
    }
    return `#${this.clips().findIndex((post) => post.id === hero.id) + 1}`;
  });

  protected readonly heroCommentCount = computed(() => {
    const hero = this.hero();
    if (!hero) {
      return 0;
    }
    return hero.commentCount + (this.commentDeltas()[hero.id] ?? 0);
  });

  protected readonly countLabel = computed(() => {
    const shown = this.clips().length;
    if (this.filter() === 'following') {
      return `${shown} clip from people you follow`;
    }
    return `${shown} of ${this.totalCount()} clips loaded`;
  });

  ngOnInit(): void {
    // The feed clip card's "Tam ekran oynatıcı" hands its post id over here.
    const requested = this.route.snapshot.queryParamMap.get('clip');
    if (requested) {
      this.selectedClipId.set(requested);
    }

    this.loadPosts(1);

    this.followService.getFollowedUsers().subscribe({
      next: (users) => this.followedUserIds.set(new Set(users.map((u) => u.userId))),
      error: () => void 0,
    });
  }

  setFilter(filter: ClipFilter): void {
    this.filter.set(filter);
    this.selectedClipId.set(null);
  }

  setRail(rail: ClipRail): void {
    this.rail.set(rail);
  }

  toggleAutoplay(): void {
    this.autoplay.update((value) => !value);
  }

  selectClip(post: PostModel): void {
    this.selectedClipId.set(post.id);
  }

  openComments(post: PostModel): void {
    this.selectedClipId.set(post.id);
    this.rail.set('comments');
  }

  /** Autoplay walks the same queue the rail shows. */
  onHeroEnded(): void {
    if (!this.autoplay()) {
      return;
    }
    const next = this.upNext()[0];
    if (next) {
      this.selectedClipId.set(next.id);
    }
  }

  onCommentCountChanged(postId: string, delta: number): void {
    this.commentDeltas.update((deltas) => ({ ...deltas, [postId]: (deltas[postId] ?? 0) + delta }));
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
          this.totalCount.set(result.totalCount);
        },
        error: () => this.notificationService.error('Failed to load clips.'),
      });
  }
}
