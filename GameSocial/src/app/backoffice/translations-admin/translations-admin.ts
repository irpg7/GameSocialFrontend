import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { LanguageService } from '../../services/language/language.service';
import { TranslationService } from '../../services/translation/translation.service';
import { NotificationService } from '../../services/notification/notification.service';
import { LanguageModel } from '../../models/language.model';
import { extractApiErrorMessage } from '../../shared/api-error.util';

interface TranslationRow {
  key: string;
  value: string;
  savedValue: string;
  isSaving: boolean;
}

@Component({
  selector: 'app-translations-admin',
  imports: [FormsModule],
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

  protected readonly newLanguageCode = signal('');
  protected readonly newLanguageName = signal('');
  protected readonly isCreatingLanguage = signal(false);
  protected readonly languageError = signal<string | null>(null);

  protected readonly rows = signal<TranslationRow[]>([]);
  protected readonly isLoadingTranslations = signal(false);

  protected readonly newKey = signal('');
  protected readonly newValue = signal('');
  protected readonly isAddingKey = signal(false);
  protected readonly newKeyError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadLanguages();
  }

  selectLanguage(code: string): void {
    this.selectedLanguageCode.set(code);
    this.newKeyError.set(null);
    this.loadTranslations(code);
  }

  createLanguage(): void {
    const code = this.newLanguageCode().trim();
    const name = this.newLanguageName().trim();
    if (!code || !name) {
      this.languageError.set('Code and name are required.');
      return;
    }
    this.languageError.set(null);
    this.isCreatingLanguage.set(true);
    this.languageService
      .create(code, name)
      .pipe(finalize(() => this.isCreatingLanguage.set(false)))
      .subscribe({
        next: (language) => {
          this.languages.update((existing) => [...existing, language]);
          this.newLanguageCode.set('');
          this.newLanguageName.set('');
        },
        error: (err) => this.languageError.set(extractApiErrorMessage(err, 'Failed to add language.')),
      });
  }

  updateRowValue(row: TranslationRow, value: string): void {
    row.value = value;
    this.rows.update((existing) => [...existing]);
  }

  saveTranslation(row: TranslationRow): void {
    const languageCode = this.selectedLanguageCode();
    if (!languageCode) {
      return;
    }
    row.isSaving = true;
    this.rows.update((existing) => [...existing]);
    this.translationService
      .upsert(row.key, languageCode, row.value)
      .pipe(
        finalize(() => {
          row.isSaving = false;
          this.rows.update((existing) => [...existing]);
        }),
      )
      .subscribe({
        next: () => {
          row.savedValue = row.value;
          this.rows.update((existing) => [...existing]);
        },
        error: (err) => this.notificationService.error(extractApiErrorMessage(err, 'Failed to save translation.')),
      });
  }

  addKey(): void {
    const languageCode = this.selectedLanguageCode();
    const key = this.newKey().trim();
    const value = this.newValue().trim();
    if (!languageCode) {
      return;
    }
    if (!key) {
      this.newKeyError.set('Key is required.');
      return;
    }
    if (this.rows().some((row) => row.key === key)) {
      this.newKeyError.set('This key already exists below — edit it there instead.');
      return;
    }

    this.newKeyError.set(null);
    this.isAddingKey.set(true);
    this.translationService
      .upsert(key, languageCode, value)
      .pipe(finalize(() => this.isAddingKey.set(false)))
      .subscribe({
        next: () => {
          this.rows.update((existing) =>
            [...existing, { key, value, savedValue: value, isSaving: false }].sort((a, b) => a.key.localeCompare(b.key)),
          );
          this.newKey.set('');
          this.newValue.set('');
        },
        error: (err) => this.newKeyError.set(extractApiErrorMessage(err, 'Failed to add translation.')),
      });
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
