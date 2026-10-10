import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ServerConfigService } from './server-config.service';
import { Paginated } from './models';

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];
export type Query = Record<string, QueryValue>;

/** Builds HttpParams, skipping empty values and joining arrays with commas. */
export function toParams(query?: Query): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      params = params.set(key, value.join(','));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/** Thin typed wrapper over HttpClient for the Markette API (all paths are relative to /api). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private server = inject(ServerConfigService);

  /** '/api' on web; '<server>/api' in the native app. */
  get base(): string {
    return `${this.server.apiBase()}/api`;
  }

  url(path: string): string {
    return `${this.base}/${path.replace(/^\/+/, '')}`;
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(query) });
  }

  post<T>(path: string, body: unknown = {}, query?: Query): Observable<T> {
    return this.http.post<T>(this.url(path), body, { params: toParams(query) });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  delete<T = void>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  /** GET a LimitOffset-paginated endpoint. */
  page<T>(path: string, query?: Query): Observable<Paginated<T>> {
    return this.get<Paginated<T> | T[]>(path, query).pipe(map((res) => asPage(res)));
  }

  /** GET a paginated endpoint and return just the rows (large limit: these lists are small per workspace). */
  list<T>(path: string, query?: Query): Observable<T[]> {
    return this.page<T>(path, { limit: 500, ...query }).pipe(map((p) => p.results));
  }
}

/** Accepts both paginated and bare-array responses. */
export function asPage<T>(res: Paginated<T> | T[]): Paginated<T> {
  if (Array.isArray(res)) return { count: res.length, next: null, previous: null, results: res };
  return res;
}
