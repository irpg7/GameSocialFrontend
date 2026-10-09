import { Component, OnDestroy, OnInit, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { form, maxLength } from '@angular/forms/signals';
import { finalize } from 'rxjs';
import { PostModel } from '../../../models/post.model';
import { PostType } from '../../../models/post-enums.model';
import { PostService } from '../../../services/post/post.service';
import { AuthService } from '../../../services/auth/auth.service';
import { MeService } from '../../../services/me/me.service';
import { SquadService } from '../../../services/squad/squad.service';
import { SquadModel } from '../../../models/squad.model';
import { extractApiErrorMessage } from '../../../shared/api-error.util';
import { ReviewSheet } from '../../../shared/review-sheet/review-sheet';
import { ComposerSubmission, MAX_CAPTION_LENGTH, MAX_SCREENSHOTS, MediaEntry, revokeMedia } from './composer-shared';
import { ComposerClipPanel, ComposerSharedFields, appendClip, validateClip } from './composer-clip-panel/composer-clip-panel';
import {
  ComposerScreenshotsPanel,
  ScreenshotsState,
  appendScreenshots,
  emptyScreenshotsState,
  validateScreenshots,
} from './composer-screenshots-panel/composer-screenshots-panel';
import { ComposerMoreMenu, ComposerPick } from './composer-more-menu/composer-more-menu';
import { PollSheet, PollState, emptyPollState } from './poll-sheet/poll-sheet';
import { DevlogFields, DevlogMedia, DevlogSheet, emptyDevlogFields, emptyDevlogMedia } from './devlog-sheet/devlog-sheet';

type ComposerTab = 'clip' | 'screenshots';
type ComposerSheet = 'poll' | 'devlog' | null;

/**
 * Post-type picker + composer (Gamer Feed.dc.html composer bar + sheetPoll /
 * sheetDevlog). Clip and Screenshots expand an inline panel in this bar
 * (`composer-clip-panel`, `composer-screenshots-panel`); Poll and DevLog open
 * their own sheets (`poll-sheet`, `devlog-sheet`); Review opens the standalone
 * `ReviewSheet`. "···" opens `composer-more-menu`, which also lists saved drafts.
 *
 * The composer keeps every type's unsent content (so switching tabs or closing
 * a sheet doesn't lose it) and owns the one send pipeline: PostService.createPost
 * (multipart, see CreatePostCommandValidator.cs). "Save draft" sends the same
 * payload with IsDraft=true; drafts are published/deleted from the "···" menu.
 */
@Component({
  selector: 'app-post-composer',
  imports: [ReviewSheet, ComposerClipPanel, ComposerScreenshotsPanel, ComposerMoreMenu, PollSheet, DevlogSheet],
  templateUrl: './post-composer.html',
  styleUrls: ['./post-composer.scss', './post-composer.mobile.scss'],
})
export class PostComposer implements OnInit, OnDestroy {
  private postService = inject(PostService);
  private squadService = inject(SquadService);
  private meService = inject(MeService);
  private authService = inject(AuthService);

  posted = output<PostModel>();

  /**
   * When set, the composer posts to this squad and the squad picker is
   * replaced by a locked chip. Used by the squad room.
   */
  preselectedSquadId = input<string | null>(null);
  /** Label for the locked squad chip (the squad list is not fetched twice). */
  lockedSquadName = input<string | undefined>(undefined);
  /** Opens the composer straight on the clip or screenshots tab. */
  initialTab = input<ComposerTab | null>(null);

  protected readonly isDevlogAllowed = computed(() => this.authService.currentUser()?.isDeveloper ?? false);

  protected readonly selectedTab = linkedSignal<ComposerTab | null>(() => this.initialTab());
  protected readonly openSheet = signal<ComposerSheet>(null);
  protected readonly isReviewSheetOpen = signal(false);
  protected readonly isMoreMenuOpen = signal(false);

  protected readonly composerHint = computed(() => {
    if (this.isReviewSheetOpen()) {
      return 'Review — score it, then say why';
    }
    switch (this.openSheet()) {
      case 'poll':
        return 'Poll — ask the feed something';
      case 'devlog':
        return 'DevLog — build tag, headline, patch lines';
      default:
        switch (this.selectedTab()) {
          case 'screenshots':
            return `Screenshot dump — up to ${MAX_SCREENSHOTS} images`;
          case 'clip':
            return 'New clip — drop the file and name it';
          default:
            return 'Drag a clip in — or pick a type';
        }
    }
  });

  protected readonly mySquads = signal<SquadModel[]>([]);

  // ─── Unsent content per type ───────────────────────────────────
  /** Caption, game and squad — shared by the clip and screenshots panels; squadId follows the locked squad. */
  private readonly sharedModel = linkedSignal<string | null, ComposerSharedFields>({
    source: () => this.preselectedSquadId(),
    computation: (preselected, previous) => ({
      ...(previous?.value ?? { caption: '', gameId: '', squadId: '' }),
      squadId: preselected ?? '',
    }),
  });
  protected readonly sharedForm = form(this.sharedModel, (path) => {
    maxLength(path.caption, MAX_CAPTION_LENGTH);
  });
  protected readonly clip = signal<MediaEntry | null>(null);
  protected readonly screenshots = signal<ScreenshotsState>(emptyScreenshotsState());
  protected readonly poll = signal<PollState>(emptyPollState());
  protected readonly devlogFields = signal<DevlogFields>(emptyDevlogFields());
  protected readonly devlogMedia = signal<DevlogMedia>(emptyDevlogMedia());

  protected readonly isSubmitting = signal(false);
  protected readonly isSavingDraft = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly noticeMessage = signal<string | null>(null);

  ngOnInit(): void {
    // Only feeds the optional "＋ Tag squad" picker; posting works without it.
    this.squadService.getMine().subscribe({
      next: (squads) => this.mySquads.set(squads),
      error: () => void 0,
    });
  }

  ngOnDestroy(): void {
    revokeMedia(this.clip());
    this.screenshots().files.forEach(revokeMedia);
    const { clip, before, after } = this.devlogMedia();
    [clip, before, after].forEach(revokeMedia);
  }

  selectTab(tab: ComposerTab): void {
    this.openSheet.set(null);
    this.isReviewSheetOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.selectedTab.set(this.selectedTab() === tab ? null : tab);
    this.clearMessages();
  }

  openSheetFor(sheet: 'poll' | 'devlog'): void {
    if (sheet === 'devlog' && !this.isDevlogAllowed()) {
      return;
    }
    this.isReviewSheetOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.selectedTab.set(null);
    this.openSheet.set(sheet);
    this.clearMessages();
  }

  closeSheet(): void {
    this.openSheet.set(null);
    this.errorMessage.set(null);
  }

  openReviewSheet(): void {
    this.openSheet.set(null);
    this.selectedTab.set(null);
    this.isMoreMenuOpen.set(false);
    this.isReviewSheetOpen.set(true);
    this.errorMessage.set(null);
  }

  onReviewPosted(post: PostModel): void {
    this.posted.emit(post);
    this.isReviewSheetOpen.set(false);
  }

  // ─── "···" more post types + drafts ─────────────────────────────
  toggleMoreMenu(): void {
    this.isMoreMenuOpen.update((open) => !open);
  }

  onMenuPick(pick: ComposerPick): void {
    if (pick === 'clip' || pick === 'screenshots') {
      this.selectTab(pick);
    } else if (pick === 'review') {
      this.openReviewSheet();
    } else {
      this.openSheetFor(pick);
    }
  }

  // ─── Submit ─────────────────────────────────────────────────────
  /** The bar's Post button: sends the open inline panel (the sheets have their own buttons). */
  submit(): void {
    this.clearMessages();
    const fields = this.sharedModel();
    const tab = this.selectedTab();
    if (tab === null) {
      this.errorMessage.set('Pick a post type first — clip, screenshots, review, poll or devlog.');
      return;
    }
    const formData = new FormData();
    if (tab === 'clip') {
      const error = validateClip(fields, this.clip());
      if (error) {
        this.errorMessage.set(error);
        return;
      }
      formData.append('PostType', String(PostType.Clip));
      appendClip(formData, fields, this.clip()!);
      this.send({ type: PostType.Clip, asDraft: false, formData });
    } else {
      const error = validateScreenshots(fields, this.screenshots());
      if (error) {
        this.errorMessage.set(error);
        return;
      }
      formData.append('PostType', String(PostType.Screenshots));
      appendScreenshots(formData, fields, this.screenshots());
      this.send({ type: PostType.Screenshots, asDraft: false, formData });
    }
  }

  send({ type, asDraft, formData }: ComposerSubmission): void {
    this.clearMessages();
    const busy = asDraft ? this.isSavingDraft : this.isSubmitting;
    busy.set(true);
    this.postService
      .createPost(formData)
      .pipe(finalize(() => busy.set(false)))
      .subscribe({
        next: (post) => {
          if (asDraft) {
            this.noticeMessage.set('Draft saved — find it under ··· in the composer.');
          } else {
            this.posted.emit(post);
          }
          this.meService.refresh().subscribe({ error: () => void 0 });
          this.resetType(type);
          this.openSheet.set(null);
          this.selectedTab.set(null);
        },
        error: (err: unknown) => this.errorMessage.set(extractApiErrorMessage(err, 'Failed to publish post. Please try again.')),
      });
  }

  protected showProblem(message: string): void {
    this.errorMessage.set(message);
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.noticeMessage.set(null);
  }

  private resetType(type: PostType): void {
    const keepSquad = this.preselectedSquadId() ?? '';
    switch (type) {
      case PostType.Clip:
        this.sharedModel.set({ caption: '', gameId: '', squadId: keepSquad });
        revokeMedia(this.clip());
        this.clip.set(null);
        break;
      case PostType.Screenshots:
        this.sharedModel.update((m) => ({ ...m, caption: '', squadId: keepSquad }));
        this.screenshots().files.forEach(revokeMedia);
        this.screenshots.set(emptyScreenshotsState());
        break;
      case PostType.Devlog: {
        const { clip, before, after } = this.devlogMedia();
        [clip, before, after].forEach(revokeMedia);
        this.devlogFields.set(emptyDevlogFields());
        this.devlogMedia.set(emptyDevlogMedia());
        break;
      }
      case PostType.Poll:
        this.poll.set(emptyPollState());
        break;
    }
  }
}
