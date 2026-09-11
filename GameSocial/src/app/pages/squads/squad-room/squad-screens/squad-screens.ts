import { Component, computed, input, output, signal } from '@angular/core';
import { PostModel, PostMediaModel } from '../../../../models/post.model';
import { PhotoViewer } from '../../../../shared/photo-viewer/photo-viewer';
import { formatTimeAgo } from '../../../../shared/clip-format';

/** One tile in the mosaic, kept with the post it came from so the viewer can open it. */
interface ScreenTile {
  post: PostModel;
  media: PostMediaModel;
  /** Index of this photo within its own post — what PhotoViewer's startIndex wants. */
  indexInPost: number;
}

interface GameFilter {
  id: number | null;
  label: string;
}

/** The design's mosaic shows 8 tiles, the last carrying a "+N" overflow badge. */
const MAX_TILES = 8;

/**
 * Screens tab of the squad room, from Gamer Feed.dc.html `onSquad` +
 * `onScreens`: a filter chip row with a trailing add action, a four-column
 * mosaic whose lead tile spans 2×2 and whose last tile carries a "+N"
 * overflow overlay, and an activity line underneath.
 *
 * `app-photo-grid` is not reused here: it lays out the photos of a *single*
 * post and hard-caps at five visible tiles, whereas this mosaic pools the
 * photos of every screenshot post in the squad. Clicking a tile still opens
 * the shared `app-photo-viewer`, scoped to the post that photo belongs to.
 *
 * The mock's "Photo mode / Builds / Maps" chips are invented album categories
 * with no backing concept; real game filters take their place.
 */
@Component({
  selector: 'app-squad-screens',
  imports: [PhotoViewer],
  templateUrl: './squad-screens.html',
  styleUrl: './squad-screens.scss',
})
export class SquadScreens {
  posts = input.required<PostModel[]>();
  totalCount = input(0);
  isLoading = input(false);
  canPost = input(false);
  activeGameId = input<number | null>(null);

  gamePicked = output<number | null>();
  add = output<void>();

  protected readonly viewerTile = signal<ScreenTile | null>(null);

  private readonly tiles = computed<ScreenTile[]>(() =>
    this.posts().flatMap((post) => {
      const photos = post.media.filter((media) => media.mediaType === 'Photo');
      return photos.map((media, indexInPost) => ({ post, media, indexInPost }));
    }),
  );

  protected readonly visibleTiles = computed(() => this.tiles().slice(0, MAX_TILES));

  protected readonly hiddenCount = computed(() => Math.max(0, this.tiles().length - MAX_TILES));

  protected readonly filters = computed<GameFilter[]>(() => {
    const seen = new Map<number, string>();
    for (const post of this.posts()) {
      if (post.gameId != null && post.gameName) {
        seen.set(post.gameId, post.gameName);
      }
    }
    return [
      { id: null, label: `All ${this.totalCount()}` },
      ...[...seen.entries()].map(([id, label]) => ({ id, label })),
    ];
  });

  /** The design's footer line: who last added screens, how many, and when. */
  protected readonly latestActivity = computed(() => {
    const newest = this.posts()[0];
    if (!newest) {
      return null;
    }
    const count = newest.media.filter((media) => media.mediaType === 'Photo').length;
    return {
      username: newest.username,
      initial: newest.username.charAt(0).toUpperCase(),
      count,
      gameName: newest.gameName,
      when: formatTimeAgo(newest.createdAt),
    };
  });

  protected readonly viewerPhotos = computed(() =>
    this.viewerTile()?.post.media.filter((media) => media.mediaType === 'Photo') ?? [],
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
