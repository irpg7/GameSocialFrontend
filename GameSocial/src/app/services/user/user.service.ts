import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUserListQuery, AdminUserModel } from '../../models/admin-user.model';
import { PagedResult } from '../../models/paged-result.model';
import { toHttpParams } from '../../shared/http-params';

/** Backoffice-only user administration (Users.Manage permission required server-side). */
@Service()
export class UserService {
  private http = inject(HttpClient);
  private apiUrl = '/api/users';

  list(query: AdminUserListQuery = {}): Observable<PagedResult<AdminUserModel>> {
    return this.http.get<PagedResult<AdminUserModel>>(this.apiUrl, { params: toHttpParams(query) });
  }

  grantPermission(userId: string, permissionKey: string): Observable<AdminUserModel> {
    return this.http.post<AdminUserModel>(`${this.apiUrl}/${userId}/permissions`, { permissionKey });
  }

  /** Approve (true) or revoke/decline (false) a developer account. The user's open sessions end. */
  setDeveloper(userId: string, isDeveloper: boolean): Observable<AdminUserModel> {
    return this.http.put<AdminUserModel>(`${this.apiUrl}/${userId}/developer`, { isDeveloper });
  }

  revokePermission(userId: string, permissionKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userId}/permissions/${encodeURIComponent(permissionKey)}`);
  }
}
