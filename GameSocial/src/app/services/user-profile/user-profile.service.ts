import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserProfileModel } from '../../models/user-profile.model';

@Service()
export class UserProfileService {
  private http = inject(HttpClient);

  getProfile(userId: string): Observable<UserProfileModel> {
    return this.http.get<UserProfileModel>(`/api/users/${userId}/profile`);
  }
}
