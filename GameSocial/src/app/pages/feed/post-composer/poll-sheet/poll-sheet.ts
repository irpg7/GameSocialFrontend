import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, output, signal, viewChildren } from '@angular/core';
import { FormField, applyEach, form, maxLength } from '@angular/forms/signals';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { GamePicker } from '../../../../shared/game-picker/game-picker';
import { PostMediaType, PostType } from '../../../../models/post-enums.model';
import {
  ComposerSubmission,
  MAX_CAPTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  idOrNull,
} from '../composer-shared';

/** Poll "Open for" chips — the server only accepts these three durations. */
const POLL_DURATIONS = [
  { key: '24h', label: '24 hours', hours: 24 },
  { key: '3d', label: '3 days', hours: 72 },
  { key: '1w', label: '1 week', hours: 168 },
] as const;
type PollDuration = (typeof POLL_DURATIONS)[number]['key'];

/** The sheet's content. The composer holds it, so closing and reopening the sheet keeps what was typed. */
export interface PollState {
  question: string;
  options: string[];
  /** '' = any game. */
  gameId: string;
  duration: PollDuration;
  /** The design draws the switch on by default. */
  hideResults: boolean;
}

export function emptyPollState(): PollState {
  return { question: '', options: ['', ''], gameId: '', duration: '24h', hideResults: true };
}

/**
 * New poll sheet (Gamer Feed.dc.html `sheetPoll`): question, two to six options, how long it stays
 * open, an optional game and "hide results until you vote". It validates and builds the multipart
 * payload; the composer sends it (`send`) and owns the busy flags and the server's error message.
 */
@Component({
  selector: 'app-poll-sheet',
  imports: [FormField, SheetModal, GamePicker],
  templateUrl: './poll-sheet.html',
  styleUrl: './poll-sheet.scss',
})
export class PollSheet {
  private injector = inject(Injector);

  isSubmitting = input(false);
  isSavingDraft = input(false);
  /** The last send's failure (server message), shown above the footer. */
  errorMessage = input<string | null>(null);
  state = model.required<PollState>();
  closed = output<void>();
  send = output<ComposerSubmission>();

  protected readonly pollDurations = POLL_DURATIONS;
  protected readonly maxPollOptions = MAX_POLL_OPTIONS;
  // The ghost "Add an option" input isn't a form field, so it reads the limit directly.
  protected readonly maxPollOptionLength = MAX_POLL_OPTION_LENGTH;

  protected readonly pollForm = form(this.state, (path) => {
    maxLength(path.question, MAX_CAPTION_LENGTH);
    applyEach(path.options, (option) => {
      maxLength(option, MAX_POLL_OPTION_LENGTH);
    });
  });

  private optionInputs = viewChildren<ElementRef<HTMLInputElement>>('pollOptionInput');
  private readonly validationError = signal<string | null>(null);
  protected readonly shownError = computed(() => this.validationError() ?? this.errorMessage());
  protected readonly options = computed(() => this.state().options);

  protected setDuration(duration: PollDuration): void {
    this.state.update((s) => ({ ...s, duration }));
  }

  protected toggleHideResults(): void {
    this.state.update((s) => ({ ...s, hideResults: !s.hideResults }));
  }

  protected addOption(): void {
    if (this.options().length < MAX_POLL_OPTIONS) {
      this.state.update((s) => ({ ...s, options: [...s.options, ''] }));
      afterNextRender(() => this.optionInputs().at(-1)?.nativeElement.focus(), { injector: this.injector });
    }
  }

  /** Typing into the trailing "Add an option" row turns it into a real option. */
  protected onGhostOptionInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const value = inputEl.value;
    inputEl.value = '';
    if (!value || this.options().length >= MAX_POLL_OPTIONS) {
      return;
    }
    this.state.update((s) => ({ ...s, options: [...s.options, value] }));
    afterNextRender(
      () => {
        const el = this.optionInputs().at(-1)?.nativeElement;
        el?.focus();
        el?.setSelectionRange(value.length, value.length);
      },
      { injector: this.injector },
    );
  }

  protected removeOption(index: number): void {
    this.state.update((s) => ({ ...s, options: s.options.filter((_, i) => i !== index) }));
  }

  /** A draft may be partial (the server relaxes required fields and re-checks them on publish). */
  protected submit(asDraft: boolean): void {
    const error = asDraft ? null : validatePoll(this.state());
    this.validationError.set(error);
    if (!error) {
      this.send.emit({ type: PostType.Poll, asDraft, formData: buildPollFormData(this.state(), asDraft) });
    }
  }
}

function validatePoll(state: PollState): string | null {
  if (!state.question.trim()) {
    return 'Ask the feed something — the question is required.';
  }
  if (state.question.length > MAX_CAPTION_LENGTH) {
    return `Question must be ${MAX_CAPTION_LENGTH} characters or fewer.`;
  }
  const options = state.options.map((option) => option.trim()).filter((option) => option.length > 0);
  if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
    return `Please provide ${MIN_POLL_OPTIONS}-${MAX_POLL_OPTIONS} options.`;
  }
  if (options.some((option) => option.length > MAX_POLL_OPTION_LENGTH)) {
    return `Each option must be ${MAX_POLL_OPTION_LENGTH} characters or fewer.`;
  }
  return null;
}

function buildPollFormData(state: PollState, asDraft: boolean): FormData {
  const formData = new FormData();
  formData.append('PostType', String(PostType.Poll));
  if (asDraft) {
    formData.append('IsDraft', 'true');
  }
  formData.append('Caption', state.question.trim());
  for (const option of state.options) {
    if (option.trim()) {
      formData.append('PollOptions', option.trim());
    }
  }
  const hours = POLL_DURATIONS.find((d) => d.key === state.duration)!.hours;
  formData.append('ExpiresAt', new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
  formData.append('HideResultsUntilVoted', String(state.hideResults));
  const gameId = idOrNull(state.gameId);
  if (gameId !== null) {
    formData.append('GameId', String(gameId));
  }
  formData.append('MediaType', String(PostMediaType.Photo));
  return formData;
}
