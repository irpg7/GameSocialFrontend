import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingModel } from '../../models/setting.model';

@Service()
export class SettingService {
  private http = inject(HttpClient);
  private apiUrl = '/api/settings';

  list(): Observable<SettingModel[]> {
    return this.http.get<SettingModel[]>(this.apiUrl);
  }

  update(key: string, value: string): Observable<SettingModel> {
    return this.http.put<SettingModel>(`${this.apiUrl}/${encodeURIComponent(key)}`, { value });
  }
}
