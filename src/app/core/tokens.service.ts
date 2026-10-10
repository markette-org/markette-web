import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiToken, ApiTokenCreated, Id } from './models';

/** Personal API tokens (Bearer mkt_…) for scripts and MCP clients. */
@Injectable({ providedIn: 'root' })
export class TokensService {
  private api = inject(ApiService);

  list(): Observable<ApiToken[]> {
    return this.api.get<ApiToken[]>('auth/tokens/');
  }
  create(name: string, expiresInDays?: number | null): Observable<ApiTokenCreated> {
    return this.api.post<ApiTokenCreated>('auth/tokens/', { name, expires_in_days: expiresInDays || null });
  }
  revoke(id: Id): Observable<void> {
    return this.api.delete(`auth/tokens/${id}/`);
  }
}
