import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUserModel } from '../../models/admin-user.model';

/** Backoffice-only user administration (Users.Manage permission required server-side). */
@Service()
export class UserService {
  private http = inject(HttpClient);
  private apiUrl = '/api/users';

  list(): Observable<AdminUserModel[]> {
    return this.http.get<AdminUserModel[]>(this.apiUrl);
  }

  grantPermission(userId: string, permissionKey: string): Observable<AdminUserModel> {
    return this.http.post<AdminUserModel>(`${this.apiUrl}/${userId}/permissions`, { permissionKey });
  }

  revokePermission(userId: string, permissionKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userId}/permissions/${encodeURIComponent(permissionKey)}`);
  }
}
