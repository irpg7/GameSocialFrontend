import { Component, OnInit, inject, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { finalize, firstValueFrom } from 'rxjs';
import { LanguageService } from '../../services/language/language.service';
import { TranslationService } from '../../services/translation/translation.service';
import { NotificationService } from '../../services/notification/notification.service';
import { LanguageModel } from '../../models/language.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';
import { fieldError, serverError, submitError } from '../../shared/form-errors';

interface TranslationRow {
  key: string;
  value: string;
  savedValue: string;
  isSaving: boolean;
}

const LANGUAGE_REQUIRED = 'Code and name are required.';

@Component({
  selector: 'app-translations-admin',
  imports: [FormField],
  templateUrl: './translations-admin.html',
  styleUrl: './translations-admin.scss',
})
export class TranslationsAdmin implements OnInit {
  private languageService = inject(LanguageService);
  private translationService = inject(TranslationService);
  private notificationService = inject(NotificationService);

  protected readonly languages = signal<LanguageModel[]>([]);
  protected readonly isLoadingLanguages = signal(true);
  protected readonly selectedLanguageCode = signal<string | null>(null);

  // ─── Add a language ────────────────────────────────────────────
  private readonly languageModel = signal({ code: '', name: '' });
  protected readonly languageForm = form(
    this.languageModel,
    (path) => {
      validate(path.code, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: LANGUAGE_REQUIRED }));
      validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: LANGUAGE_REQUIRED }));
    },
    {
      submission: {
        action: async () => {
          const { code, name } = this.languageModel();
          try {
            const language = await firstValueFrom(this.languageService.create(code.trim(), name.trim()));
            this.languages.update((existing) => [...existing, language]);
            this.languageModel.set({ code: '', name: '' });
            this.languageForm().reset();
            return undefined;
          } catch (err) {
            return serverError(err, 'Failed to add language.');
          }
        },
      },
    },
  );

  protected readonly languageError = () =>
    fieldError(this.languageForm.code()) ?? fieldError(this.languageForm.name()) ?? submitError(this.languageForm());

  // ─── Translation rows (the table is the form, saved per row) ───
  protected readonly rows = signal<TranslationRow[]>([]);
  protected readonly rowsForm = form(this.rows);
  protected readonly isLoadingTranslations = signal(false);

  // ─── Add a key ─────────────────────────────────────────────────
  private readonly keyModel = signal({ key: '', value: '' });
  protected readonly keyForm = form(
    this.keyModel,
    (path) => {
      validate(path.key, ({ value }) => {
        const key = value().trim();
        if (!key) {
          return { kind: 'required', message: 'Key is required.' };
        }
        if (this.rows().some((row) => row.key === key)) {
          return { kind: 'duplicate', message: 'This key already exists below — edit it there instead.' };
        }
        return undefined;
      });
    },
    {
      submission: {
        action: async () => {
          const languageCode = this.selectedLanguageCode();
          if (!languageCode) {
            return undefined;
          }
          const key = this.keyModel().key.trim();
          const value = this.keyModel().value.trim();
          try {
            await firstValueFrom(this.translationService.upsert(key, languageCode, value));
            this.rows.update((existing) =>
              [...existing, { key, value, savedValue: value, isSaving: false }].sort((a, b) => a.key.localeCompare(b.key)),
            );
            this.keyModel.set({ key: '', value: '' });
            this.keyForm().reset();
            return undefined;
          } catch (err) {
            return serverError(err, 'Failed to add translation.');
          }
        },
      },
    },
  );

  protected readonly newKeyError = () => fieldError(this.keyForm.key()) ?? submitError(this.keyForm());

  ngOnInit(): void {
    this.loadLanguages();
  }

  selectLanguage(code: string): void {
    this.selectedLanguageCode.set(code);
    this.keyForm().reset();
    this.loadTranslations(code);
  }

  createLanguage(): void {
    void submit(this.languageForm);
  }

  addKey(): void {
    void submit(this.keyForm);
  }

  saveTranslation(key: string): void {
    const languageCode = this.selectedLanguageCode();
    const row = this.rows().find((candidate) => candidate.key === key);
    if (!languageCode || !row) {
      return;
    }
    const value = row.value;
    this.patchRow(key, { isSaving: true });
    this.translationService
      .upsert(key, languageCode, value)
      .pipe(finalize(() => this.patchRow(key, { isSaving: false })))
      .subscribe({
        next: () => this.patchRow(key, { savedValue: value }),
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to save translation.')),
      });
  }

  private patchRow(key: string, patch: Partial<TranslationRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  private loadLanguages(): void {
    this.isLoadingLanguages.set(true);
    this.languageService
      .list()
      .pipe(finalize(() => this.isLoadingLanguages.set(false)))
      .subscribe({
        next: (languages) => {
          this.languages.set(languages);
          if (languages.length > 0 && !this.selectedLanguageCode()) {
            this.selectLanguage(languages[0].code);
          }
        },
        error: () => this.notificationService.error('Failed to load languages.'),
      });
  }

  private loadTranslations(languageCode: string): void {
    this.isLoadingTranslations.set(true);
    this.translationService
      .getAll(languageCode)
      .pipe(finalize(() => this.isLoadingTranslations.set(false)))
      .subscribe({
        next: (dictionary) => {
          const rows: TranslationRow[] = Object.entries(dictionary)
            .map(([key, value]) => ({ key, value, savedValue: value, isSaving: false }))
            .sort((a, b) => a.key.localeCompare(b.key));
          this.rows.set(rows);
        },
        error: () => this.notificationService.error('Failed to load translations.'),
      });
  }
}
