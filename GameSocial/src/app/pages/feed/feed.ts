import { Component, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PostService } from '../../services/post/post.service';
import { GameService } from '../../services/game/game.service';
import { SquadService } from '../../services/squad/squad.service';
import { NotificationService } from '../../services/notification/notification.service';
import { MeService } from '../../services/me/me.service';
import { PostModel } from '../../models/post.model';
import { GameModel } from '../../models/game.model';
import { SquadModel } from '../../models/squad.model';
import { PostComposer } from './post-composer/post-composer';
import { PostCard } from './post-card/post-card';
import { FeedSidebar } from './feed-sidebar/feed-sidebar';
import { FeedRightRail } from './feed-right-rail/feed-right-rail';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-feed',
  imports: [PostComposer, PostCard, FeedSidebar, FeedRightRail],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
})
export class Feed implements OnInit {
  private postService = inject(PostService);
  private gameService = inject(GameService);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);
  private meService = inject(MeService);

  protected readonly posts = signal<PostModel[]>([]);
  protected readonly games = signal<GameModel[]>([]);
  /** Fetched once here (not per-card) and passed down so PostCard can resolve a squad-tagged post's name client-side. */
  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoadingFeed = signal(true);
  protected readonly isLoadingMore = signal(false);

  ngOnInit(): void {
    this.loadPosts(1);

    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => this.notificationService.error('Failed to load games.'),
    });

    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  onPosted(post: PostModel): void {
    this.posts.update((existing) => [post, ...existing]);
    // Creating a post can award XP and bump the streak — refresh live state.
    this.meService.refresh().subscribe({ error: () => void 0 });
  }

  loadMore(): void {
    this.loadPosts(this.page() + 1, true);
  }

  private loadPosts(page: number, append = false): void {
    const loadingSignal = append ? this.isLoadingMore : this.isLoadingFeed;
    loadingSignal.set(true);
    this.postService
      .getPosts(page, PAGE_SIZE)
      .pipe(finalize(() => loadingSignal.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (append ? [...existing, ...result.items] : result.items));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: () => this.notificationService.error('Failed to load feed.'),
      });
  }
}
