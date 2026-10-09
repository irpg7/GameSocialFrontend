import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subscription, finalize, map } from 'rxjs';
import { PostService } from '../../../services/post/post.service';
import { MeService } from '../../../services/me/me.service';
import { SquadService } from '../../../services/squad/squad.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { PostModel } from '../../../models/post.model';
import { SquadModel } from '../../../models/squad.model';
import { PagedResult } from '../../../models/paged-result.model';
import { PostCard } from '../../feed/post-card/post-card';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { LoadError } from '../../../shared/load-error/load-error';

/** Which account-menu list this route renders (route `data.mode`). */
export type MyPostListMode = 'saved' | 'clips' | 'reviews';

const PAGE_SIZE = 10;

const COPY: Record<MyPostListMode, { title: string; sub: string; empty: string }> = {
  saved: { title: 'Kaydedilenler', sub: 'Clips, screenshots and reviews you saved, newest first.', empty: 'Nothing saved yet — hit ◇ Save on any post.' },
  clips: { title: 'Klipslerim', sub: 'Every clip you have posted.', empty: 'You haven\'t posted a clip yet.' },
  reviews: { title: 'İncelemelerim', sub: 'Every review you have written.', empty: 'You haven\'t written a review yet.' },
};

/**
 * Account menu lists: ◇ Kaydedilenler (`GET posts/saved`), ▶ Klipslerim and
 * ★ İncelemelerim (`GET posts?userId=me&postType=`), rendered with the feed's
 * own post cards.
 */
@Component({
  selector: 'app-my-post-list',
  imports: [PostCard, LoadError],
  template: `
    <div class="my-list">
      <div class="page-head">
        <div>
          <h1>{{ copy().title }}</h1>
          <p class="page-sub">{{ copy().sub }}</p>
        </div>
      </div>

      @for (post of posts(); track post.id) {
        <app-post-card [post]="post" [mySquads]="mySquads()" />
      }

      @if (isLoading()) {
        <p class="status">Loading...</p>
      } @else if (loadError(); as error) {
        <app-load-error [message]="error" (retry)="load(1)" />
      } @else if (posts().length === 0) {
        <p class="status empty">{{ copy().empty }}</p>
      }

      @if (hasMore() && !isLoading()) {
        <button type="button" class="btn btn-secondary load-more" (click)="load(page() + 1)">Load more</button>
      }
    </div>
  `,
  styleUrl: './my-post-list.scss',
})
export class MyPostList {
  private postService = inject(PostService);
  private meService = inject(MeService);
  private squadService = inject(SquadService);
  private notificationService = inject(NotificationService);

  protected readonly mode = toSignal(inject(ActivatedRoute).data.pipe(map((d) => (d['mode'] as MyPostListMode) ?? 'saved')), {
    initialValue: 'saved' as MyPostListMode,
  });
  protected readonly copy = computed(() => COPY[this.mode()]);
  protected readonly posts = signal<PostModel[]>([]);
  protected readonly mySquads = signal<SquadModel[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  private request$: Subscription | null = null;

  constructor() {
    // Klipslerim / İncelemelerim need my id — wait for /users/me, then (re)load.
    const meId = computed(() => this.meService.me()?.id);
    effect(() => {
      const mode = this.mode();
      if (mode === 'saved' || meId()) {
        untracked(() => this.load(1));
      }
    });
    this.squadService.getMine().subscribe({ next: (s) => this.mySquads.set(s), error: () => void 0 });
  }

  load(page: number): void {
    if (page === 1) {
      // Switching between Saved / My clips / My reviews: the previous list's response must not land here.
      this.request$?.unsubscribe();
      this.posts.set([]);
      this.loadError.set(null);
    }
    this.isLoading.set(true);
    this.request$ = this.request(page)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          this.posts.update((existing) => (page === 1 ? result.items : [...existing, ...result.items]));
          this.page.set(result.page);
          this.hasMore.set(result.hasMore);
        },
        error: (err: unknown) => {
          if (page === 1) {
            this.loadError.set('Error loading posts.');
          } else {
            this.notificationService.error(extractApiErrorMessage(err, 'Failed to load posts.'));
          }
        },
      });
  }

  private request(page: number): Observable<PagedResult<PostModel>> {
    const userId = this.meService.me()?.id;
    switch (this.mode()) {
      case 'clips':
        return this.postService.getPosts(page, PAGE_SIZE, { userId, postType: 'Clip' });
      case 'reviews':
        return this.postService.getPosts(page, PAGE_SIZE, { userId, postType: 'Review' });
      default:
        return this.postService.getSavedPosts(page, PAGE_SIZE);
    }
  }
}
