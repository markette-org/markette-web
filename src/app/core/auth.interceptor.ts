import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { ServerConfigService } from './server-config.service';
import { AuthService } from './auth.service';
import { WorkspaceService } from './workspace.service';

const PUBLIC = ['auth/token/', 'auth/register/', 'auth/token/refresh/'];

function isApi(url: string, apiBase: string): boolean {
  const base = `${apiBase}/api/`;
  return url.startsWith(base) || url.startsWith('/api/');
}

function withHeaders(req: HttpRequest<unknown>, token: string | null, workspace: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspace) headers['X-Workspace'] = workspace;
  return req.clone({ setHeaders: headers });
}

/** Adds the bearer token + X-Workspace header; on 401 refreshes once and retries, else logs out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req.url, inject(ServerConfigService).apiBase()) || PUBLIC.some((p) => req.url.includes(p))) return next(req);
  const auth = inject(AuthService);
  const ws = inject(WorkspaceService);
  const router = inject(Router);

  return next(withHeaders(req, auth.accessToken, ws.slug())).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 403) noteForbidden(err, ws);
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      if (!auth.hasRefreshToken()) {
        auth.logout(true, router.url);
        return throwError(() => err);
      }
      return auth.refresh().pipe(
        catchError((refreshErr) => {
          ws.clear();
          auth.logout(true, router.url);
          return throwError(() => refreshErr);
        }),
        switchMap((token) =>
          next(withHeaders(req, token, ws.slug())).pipe(
            catchError((retryErr: unknown) => {
              if (retryErr instanceof HttpErrorResponse && retryErr.status === 401) {
                ws.clear();
                auth.logout(true, router.url);
              }
              return throwError(() => retryErr);
            }),
          ),
        ),
      );
    }),
  );
};

/** Turns tenant-level 403s into app state: suspended org → blocking screen; archived → refresh flags. */
function noteForbidden(err: HttpErrorResponse, ws: WorkspaceService) {
  const detail = typeof err.error === 'object' && err.error ? String((err.error as { detail?: unknown }).detail ?? '') : '';
  if (/suspended/i.test(detail)) {
    ws.blocked.set('suspended');
  } else if (/archived/i.test(detail) && !ws.archived()) {
    void ws.reload().catch(() => undefined);
  }
}
