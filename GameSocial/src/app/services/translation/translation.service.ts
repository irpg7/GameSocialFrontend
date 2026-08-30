import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Corresponds to Domain.Responses.TranslationResponse. */
export interface TranslationResult {
  key: string;
  languageCode: string;
  value: string;
}

@Service()
export class TranslationService {
  private http = inject(HttpClient);

  /** Backend returns a flat { key: value } dictionary for the given language. */
  getAll(languageCode: string): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`/api/translations/${encodeURIComponent(languageCode)}`);
  }

  upsert(key: string, languageCode: string, value: string): Observable<TranslationResult> {
    return this.http.put<TranslationResult>(
      `/api/translations/${encodeURIComponent(key)}/${encodeURIComponent(languageCode)}`,
      { value },
    );
  }
}
