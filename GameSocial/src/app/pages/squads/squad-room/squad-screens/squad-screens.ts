import { Component, computed, input, output, signal } from '@angular/core';
import { PostModel, PostMediaModel } from '../../../../models/post.model';
import { SquadGameModel } from '../../../../models/squad.model';
import { PhotoViewer } from '../../../../shared/photo-viewer/photo-viewer';
import { agoShortEn } from '../squad-format';

interface ScreenTile {
  post: PostModel;
  media: PostMediaModel;
  /** Index of this photo within its own post — PhotoViewer's startIndex. */
  indexInPost: number;
}

/** The design's mosaic: one 2×2 lead tile + four singles; the last carries "+N". */
const MAX_TILES = 5;

/**
 * Screens tab of the squad room, `onSquad` + `onScreens` (05-squad.html
 * L157–179): "All N" + one chip per squad game + "＋ Add screens", a 4-column
 * mosaic (104px rows, 2×2 lead tile, 5 tiles, "+N" overlay on the last where
 * N = real photo total − 5), and the "X added N screens to Y · 3 h" line.
 * Tiles open the shared photo viewer scoped to their post.
 */
@Component({
  selector: 'app-squad-screens',
  imports: [PhotoViewer],
  templateUrl: './squad-screens.html',
  styleUrl: './squad-screens.scss',
})
export class SquadScreens {
  posts = input.required<PostModel[]>();
  games = input<SquadGameModel[]>([]);
  /** All photos in the squad (the "All N" chip). */
  totalCount = input(0);
  /** Photos in the current filter (server count) — drives "+N". */
  filteredCount = input(0);
  isLoading = input(false);
  canPost = input(false);
  activeGameId = input<number | null>(null);

  gamePicked = output<number | null>();
  add = output<void>();

  protected readonly viewerTile = signal<ScreenTile | null>(null);

  protected readonly tiles = computed<ScreenTile[]>(() =>
    this.posts().flatMap((post) =>
      post.media
        .filter((media) => media.mediaType === 'Photo')
        .map((media, indexInPost) => ({ post, media, indexInPost })),
    ),
  );

  protected readonly visibleTiles = computed(() => this.tiles().slice(0, MAX_TILES));

  protected readonly hiddenCount = computed(() => {
    const total = Math.max(this.filteredCount(), this.tiles().length);
    return Math.max(0, total - this.visibleTiles().length);
  });

  protected readonly latestActivity = computed(() => {
    const newest = this.posts()[0];
    if (!newest) {
      return null;
    }
    return {
      username: newest.username,
      avatarUrl: newest.authorAvatarUrl,
      count: newest.media.filter((media) => media.mediaType === 'Photo').length,
      gameName: newest.gameName,
      when: agoShortEn(newest.createdAt),
    };
  });

  protected readonly viewerPhotos = computed(
    () => this.viewerTile()?.post.media.filter((media) => media.mediaType === 'Photo') ?? [],
  );

  protected openTile(tile: ScreenTile): void {
    this.viewerTile.set(tile);
  }

  protected closeViewer(): void {
    this.viewerTile.set(null);
  }

  protected tileAlt(tile: ScreenTile): string {
    return tile.post.caption?.trim() || `Screenshot by ${tile.post.username}`;
  }
}
