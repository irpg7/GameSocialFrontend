import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LanguageModel } from '../../models/language.model';

@Service()
export class LanguageService {
  private http = inject(HttpClient);
  private apiUrl = '/api/languages';

  list(): Observable<LanguageModel[]> {
    return this.http.get<LanguageModel[]>(this.apiUrl);
  }

  create(code: string, name: string): Observable<LanguageModel> {
    return this.http.post<LanguageModel>(this.apiUrl, { code, name });
  }
}
