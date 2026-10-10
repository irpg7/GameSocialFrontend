import { Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';
import { PostModel } from '../../models/post.model';
import { PostService } from '../../services/post/post.service';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { LoadError } from '../../shared/load-error/load-error';
import { PostCard } from '../feed/post-card/post-card';

/**
 * `/posts/:id` for signed-in users: the full, interactive post card (like, comment, save…). Signed-out visitors
 * get `PublicPostPage` instead (see the routes). Gone / hidden posts show a plain "not available" note.
 */
@Component({
  selector: 'app-post-permalink',
  imports: [PostCard, LoadError, RouterLink],
  template: `
    <div class="permalink">
      <a class="permalink-back" routerLink="/feed">← Back to feed</a>
      @if (post(); as p) {
        <!-- Comments open: the post's own page, and where "commented on your post" notifications lead. -->
        <app-post-card [post]="p" [commentsOpen]="true" />
      } @else if (notFound()) {
        <div class="card permalink-gone">
          <h1>This post isn't available</h1>
          <p>It may have been deleted or removed, or it's only visible to members of a private squad.</p>
        </div>
      } @else if (error(); as message) {
        <app-load-error [message]="message" (retry)="load(id())" />
      } @else {
        <p class="text-muted">Loading post...</p>
      }
    </div>
  `,
  styles: `
    @use '../../../styles/variables' as *;

    .permalink {
      display: flex;
      flex-direction: column;
      gap: $spacing-md;
      max-width: 720px;
      margin: 0 auto;
    }

    .permalink-back {
      align-self: flex-start;
      color: $color-text-secondary;
      font-size: 13px;
      text-decoration: none;

      &:hover {
        color: $color-text-primary;
      }
    }

    .permalink-gone {
      h1 {
        margin: 0 0 $spacing-sm;
        font-size: 18px;
      }

      p {
        margin: 0;
        color: $color-text-secondary;
      }
    }
  `,
})
export class PostPermalink {
  private posts = inject(PostService);

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly post = signal<PostModel | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  private request?: Subscription;

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        untracked(() => this.load(id));
      }
    });
  }

  protected load(id: string): void {
    this.request?.unsubscribe();
    this.post.set(null);
    this.notFound.set(false);
    this.error.set(null);
    this.request = this.posts.getPublicPost(id).subscribe({
      next: (post) => this.post.set(post),
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && (err.status === 404 || err.status === 400)) {
          this.notFound.set(true);
          return;
        }
        this.error.set(extractApiErrorMessage(err, 'Could not load this post.'));
      },
    });
  }
}
