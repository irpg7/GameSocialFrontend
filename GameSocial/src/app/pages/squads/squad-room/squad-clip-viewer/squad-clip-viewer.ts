import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, switchMap, catchError } from 'rxjs';
import { PostModel } from '../../../../models/post.model';
import { PostService } from '../../../../services/post/post.service';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { ClipStage } from '../../../../shared/clip-stage/clip-stage';
import { formatCount } from '../../../../shared/clip-format';

/**
 * Watching a squad clip without leaving the room (Clips tab, guide items). The sheet holds the Clip Player spec's
 * "In-feed inline" player (⛶ opens the in-app fullscreen overlay) and steps through the list it was opened from.
 * The full Clip Player page stays one explicit tap away ("Oynatıcıda aç ↗").
 */
@Component({
  selector: 'app-squad-clip-viewer',
  imports: [SheetModal, ClipStage, RouterLink],
  template: `
    <app-sheet-modal [title]="title()" [subtitle]="subtitle()" (closed)="closed.emit()">
      @if (post(); as clip) {
        <app-clip-stage [post]="clip" variant="inline" [autoplay]="true" [expandInPlace]="true" (ended)="next()" />
      } @else if (failed()) {
        <p class="viewer-status" role="alert">Klip açılamadı.</p>
      } @else {
        <p class="viewer-status" role="status">Klip yükleniyor…</p>
      }

      <div class="viewer-foot">
        @if (queue().length > 1) {
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="index() <= 0" (click)="step(-1)">← Önceki</button>
          <span class="viewer-pos mono">{{ index() + 1 }} / {{ queue().length }}</span>
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="index() >= queue().length - 1" (click)="step(1)">Sonraki →</button>
        }
        <span class="viewer-spacer"></span>
        @if (post(); as clip) {
          <a class="viewer-link" [routerLink]="['/clips', clip.id]">Oynatıcıda aç ↗</a>
        }
      </div>
    </app-sheet-modal>
  `,
  styles: `
    @use '../../../../../styles/variables' as *;

    .viewer-status {
      margin: 0;
      padding: 48px 0;
      text-align: center;
      color: $color-text-secondary;
    }

    .viewer-foot {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }

    .viewer-pos {
      font-size: 12px;
      color: $color-text-tertiary;
    }

    .viewer-spacer {
      flex: 1;
    }

    .viewer-link {
      font-size: 13px;
      font-weight: 600;
      color: $color-accent-light;
      text-decoration: none;

      &:hover,
      &:focus-visible {
        color: $color-text-primary;
      }
    }
  `,
})
export class SquadClipViewer {
  private readonly postService = inject(PostService);

  /** The clip to start with. */
  postId = input.required<string>();
  /** The list it was opened from (the Clips tab); empty for a single clip (a guide item). */
  clips = input<PostModel[]>([]);
  closed = output<void>();

  /** Starts at `postId`, then follows ← / → inside the sheet. */
  protected readonly currentId = linkedSignal(() => this.postId());
  protected readonly queue = computed(() => this.clips());
  protected readonly index = computed(() => this.queue().findIndex((p) => p.id === this.currentId()));
  protected readonly failed = signal(false);

  /** A clip already in the list plays at once; otherwise it is fetched (guide items carry only an id). */
  protected readonly post = signal<PostModel | null>(null);

  protected readonly title = computed(() => {
    const clip = this.post();
    return clip?.caption?.trim() || clip?.gameName || 'Klip';
  });
  protected readonly subtitle = computed(() => {
    const clip = this.post();
    if (!clip) {
      return undefined;
    }
    return ['@' + clip.username, clip.gameName, `▲ ${formatCount(clip.likeCount)}`].filter(Boolean).join(' · ');
  });

  constructor() {
    toObservable(this.currentId)
      .pipe(
        switchMap((id) => {
          this.failed.set(false);
          const known = this.queue().find((p) => p.id === id);
          if (known) {
            return of(known);
          }
          this.post.set(null);
          return this.postService.getPost(id).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((post) => this.post.set(post));
  }

  protected step(delta: number): void {
    const target = this.queue()[this.index() + delta];
    if (target) {
      this.currentId.set(target.id);
    }
  }

  /** Autoplay through the list like the Clips page queue; stops at the last one. */
  protected next(): void {
    if (this.index() >= 0 && this.index() < this.queue().length - 1) {
      this.step(1);
    }
  }
}
