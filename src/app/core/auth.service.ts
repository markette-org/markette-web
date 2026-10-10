import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthTokens, RegisterPayload, RegisterResponse, SsoDiscovery, SsoExchange, User } from './models';
import { storage } from './storage';

const ACCESS = 'mk.access';
const REFRESH = 'mk.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);
  /** Interceptor-free client so token refresh never recurses into the 401 handler. */
  private raw = new HttpClient(inject(HttpBackend));

  private readonly access = signal<string | null>(storage.get(ACCESS));
  private readonly refreshToken = signal<string | null>(storage.get(REFRESH));
  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => !!this.refreshToken() || !!this.access());

  private refreshing$: Observable<string> | null = null;

  get accessToken(): string | null {
    return this.access();
  }

  private store(tokens: Partial<AuthTokens>) {
    if (tokens.access) {
      this.access.set(tokens.access);
      storage.set(ACCESS, tokens.access);
    }
    if (tokens.refresh) {
      this.refreshToken.set(tokens.refresh);
      storage.set(REFRESH, tokens.refresh);
    }
  }

  login(email: string, password: string): Observable<void> {
    return this.raw.post<AuthTokens>(this.api.url('auth/token/'), { email, password }).pipe(
      tap((t) => this.store(t)),
      map(() => undefined),
    );
  }

  register(payload: RegisterPayload): Observable<RegisterResponse> {
    return this.raw.post<RegisterResponse>(this.api.url('auth/register/'), payload).pipe(
      tap((r) => {
        this.store(r);
        this.user.set(r.user);
      }),
    );
  }

  /**
   * Native app: sign in with a personal API token (mkt_…). It is sent as the bearer on every call
   * (the API accepts tokens everywhere) and validated with /auth/me/. Works for SSO users too.
   */
  loginWithApiToken(token: string): Observable<User> {
    const t = token.trim();
    return this.raw.get<User>(this.api.url('auth/me/'), { headers: { Authorization: `Bearer ${t}` } }).pipe(
      tap((u) => {
        this.refreshToken.set(null);
        storage.remove(REFRESH);
        this.store({ access: t });
        this.user.set(u);
      }),
    );
  }

  /** Signed in with an API token (no refresh token). */
  get usesApiToken(): boolean {
    return !!this.access()?.startsWith('mkt_');
  }

  /** Is this email on an organization's SSO domain? (no auth) */
  discoverSso(email: string, next?: string): Observable<SsoDiscovery> {
    const params: Record<string, string> = { email };
    if (next) params['next'] = next;
    return this.raw.get<SsoDiscovery>(this.api.url('auth/sso/discover/'), { params });
  }

  /** Redeems the one-time SSO ticket and stores the tokens like a password login. */
  exchangeSsoTicket(ticket: string): Observable<SsoExchange> {
    return this.raw.post<SsoExchange>(this.api.url('auth/sso/exchange/'), { ticket }).pipe(
      tap((r) => {
        this.store(r);
        this.user.set(r.user);
      }),
    );
  }

  /** Exchanges the refresh token for a new pair (rotating). Concurrent callers share one request. */
  refresh(): Observable<string> {
    const token = this.refreshToken();
    if (!token) throw new Error('No refresh token');
    if (!this.refreshing$) {
      this.refreshing$ = this.raw.post<AuthTokens>(this.api.url('auth/token/refresh/'), { refresh: token }).pipe(
        tap((t) => this.store(t)),
        map((t) => t.access),
        finalize(() => (this.refreshing$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshing$;
  }

  hasRefreshToken(): boolean {
    return !!this.refreshToken();
  }

  loadMe(): Observable<User> {
    return this.api.get<User>('auth/me/').pipe(tap((u) => this.user.set(u)));
  }

  updateMe(patch: Partial<Pick<User, 'name' | 'timezone'>>): Observable<User> {
    return this.api.patch<User>('auth/me/', patch).pipe(tap((u) => this.user.set(u)));
  }

  logout(redirect = true, next?: string) {
    this.access.set(null);
    this.refreshToken.set(null);
    this.user.set(null);
    storage.remove(ACCESS);
    storage.remove(REFRESH);
    if (redirect) {
      this.router.navigate(['/login'], { queryParams: next && next !== '/' ? { next } : {} });
    }
  }
}
