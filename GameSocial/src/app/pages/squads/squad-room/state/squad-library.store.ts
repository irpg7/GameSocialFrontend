import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize } from 'rxjs';
import { PostService } from '../../../../services/post/post.service';
import { SquadRoomService } from '../../../../services/squad/squad-room.service';
import { SquadRealtimeService } from '../../../../services/squad/squad-realtime.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { PostModel } from '../../../../models/post.model';
import { SquadGuideModel, SquadLibraryModel } from '../../../../models/squad.model';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';
import { SquadClipSort } from '../squad-clips/squad-clips';
import { SquadRoomStore } from './squad-room.store';

const POST_PAGE_SIZE = 12;
/** The mosaic shows five tiles but needs a few posts' worth of photos to fill them. */
const SCREEN_PAGE_SIZE = 8;

const EMPTY_LIBRARY: SquadLibraryModel = { clipCount: 0, screenCount: 0, guideCount: 0, screenCountByGame: {} };

/**
 * The squad's library tabs: Clips, Screens and Pinned guides, plus the tab counts. Provided by
 * `SquadRoom`; guide changes from other members arrive over SignalR.
 */
@Injectable()
export class SquadLibraryStore {
  private postService = inject(PostService);
  private roomService = inject(SquadRoomService);
  private realtime = inject(SquadRealtimeService);
  private notificationService = inject(NotificationService);
  private room = inject(SquadRoomStore);

  readonly counts = signal<SquadLibraryModel>(EMPTY_LIBRARY);

  readonly clipPosts = signal<PostModel[]>([]);
  readonly isLoadingClips = signal(false);
  readonly clipGameId = signal<number | null>(null);
  readonly clipSort = signal<SquadClipSort>('new');

  readonly screenPosts = signal<PostModel[]>([]);
  readonly isLoadingScreens = signal(false);
  readonly screenGameId = signal<number | null>(null);
  readonly filteredScreenCount = computed(() => {
    const gameId = this.screenGameId();
    const counts = this.counts();
    return gameId === null ? counts.screenCount : (counts.screenCountByGame[String(gameId)] ?? 0);
  });

  readonly guides = signal<SquadGuideModel[]>([]);
  readonly isLoadingGuides = signal(false);

  private countsRequest: Subscription | null = null;
  private clipsRequest: Subscription | null = null;
  private screensRequest: Subscription | null = null;
  private guidesRequest: Subscription | null = null;

  constructor() {
    this.realtime.guidesChanged$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.squadId === this.room.squadId()) {
        this.loadGuides();
        this.loadCounts();
      }
    });
  }

  reset(): void {
    for (const request of [this.countsRequest, this.clipsRequest, this.screensRequest, this.guidesRequest]) {
      request?.unsubscribe();
    }
    this.counts.set(EMPTY_LIBRARY);
    this.clipPosts.set([]);
    this.clipGameId.set(null);
    this.clipSort.set('new');
    this.screenPosts.set([]);
    this.screenGameId.set(null);
    this.guides.set([]);
  }

  loadCounts(): void {
    this.countsRequest?.unsubscribe();
    this.countsRequest = this.roomService.getLibrary(this.room.squadId()).subscribe({
      next: (counts) => this.counts.set(counts),
      error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Kütüphane yüklenemedi.')),
    });
  }

  setClipGame(gameId: number | null): void {
    this.clipGameId.set(gameId);
    this.loadClips();
  }

  setClipSort(sort: SquadClipSort): void {
    this.clipSort.set(sort);
    this.loadClips();
  }

  setScreenGame(gameId: number | null): void {
    this.screenGameId.set(gameId);
    this.loadScreens();
  }

  /** A new post landed: drop the stale list, and reload it now if its tab is open. */
  invalidate(postType: string, tabOpen: boolean): void {
    if (postType === 'Clip') {
      this.clipPosts.set([]);
      if (tabOpen) {
        this.loadClips();
      }
    } else if (postType === 'Screenshots') {
      this.screenPosts.set([]);
      if (tabOpen) {
        this.loadScreens();
      }
    }
  }

  loadClips(): void {
    // A sort/game switch (or a squad change) cancels the previous request so it cannot land on top.
    this.clipsRequest?.unsubscribe();
    this.isLoadingClips.set(true);
    const top = this.clipSort() === 'top';
    this.clipsRequest = this.postService
      .getPosts(1, POST_PAGE_SIZE, {
        squadId: this.room.squadId(),
        postType: 'Clip',
        gameId: this.clipGameId() ?? undefined,
        sort: top ? 'top' : 'new',
        window: top ? 'week' : undefined,
      })
      .pipe(finalize(() => this.isLoadingClips.set(false)))
      .subscribe({
        next: (result) => this.clipPosts.set(result.items),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Klipler yüklenemedi.')),
      });
  }

  loadScreens(): void {
    this.screensRequest?.unsubscribe();
    this.isLoadingScreens.set(true);
    this.screensRequest = this.postService
      .getPosts(1, SCREEN_PAGE_SIZE, {
        squadId: this.room.squadId(),
        postType: 'Screenshots',
        gameId: this.screenGameId() ?? undefined,
      })
      .pipe(finalize(() => this.isLoadingScreens.set(false)))
      .subscribe({
        next: (result) => this.screenPosts.set(result.items),
        error: (err: unknown) =>
          this.notificationService.error(extractApiErrorMessage(err, 'Ekran görüntüleri yüklenemedi.')),
      });
  }

  loadGuides(): void {
    this.guidesRequest?.unsubscribe();
    this.isLoadingGuides.set(true);
    this.guidesRequest = this.roomService
      .listGuides(this.room.squadId())
      .pipe(finalize(() => this.isLoadingGuides.set(false)))
      .subscribe({
        next: (guides) => this.guides.set(guides),
        error: (err: unknown) => this.notificationService.error(extractApiErrorMessage(err, 'Guide’lar yüklenemedi.')),
      });
  }
}
