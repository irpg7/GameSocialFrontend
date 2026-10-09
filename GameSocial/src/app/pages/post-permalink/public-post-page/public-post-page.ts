import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';
import { PostModel } from '../../../models/post.model';
import { PostService } from '../../../services/post/post.service';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { LoadError } from '../../../shared/load-error/load-error';
import { PublicPostView } from '../public-post-view/public-post-view';

/**
 * `/posts/:id` for signed-out visitors: a bare header (brand + Sign in / Join), the read-only post and a sign-in
 * prompt. Link previews in chat apps don't come from here — the reverse proxy sends crawlers to the API's OG page.
 */
@Component({
  selector: 'app-public-post-page',
  imports: [NgOptimizedImage, RouterLink, LoadError, PublicPostView],
  templateUrl: './public-post-page.html',
  styleUrl: './public-post-page.scss',
})
export class PublicPostPage {
  private posts = inject(PostService);

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });
  /** Brings the visitor back here after signing in. */
  protected readonly returnUrl = computed(() => `/posts/${this.id()}`);

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
