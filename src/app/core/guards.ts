import { ServerConfigService } from './server-config.service';
import { firstValueFrom } from 'rxjs';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { WorkspaceService } from './workspace.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: state.url && state.url !== '/' ? { next: state.url } : {} });
  }
  try {
    await inject(WorkspaceService).ensureLoaded();
  } catch {
    // A failed refresh already logged the user out; otherwise let the shell show the error state.
    if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  }
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** Blocks write screens for viewers (they get bounced to the dashboard). */
export const writerGuard: CanActivateFn = () => {
  const ws = inject(WorkspaceService);
  return ws.canWrite() ? true : inject(Router).createUrlTree(['/']);
};

/** Platform console: superadmins only. */
export const superadminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.user()) {
    try {
      await firstValueFrom(auth.loadMe());
    } catch {
      return router.createUrlTree(['/']);
    }
  }
  return auth.user()?.is_superadmin ? true : router.createUrlTree(['/']);
};

/** Organization settings: owners/admins of at least one organization. */
export const orgAdminGuard: CanActivateFn = () => {
  const ws = inject(WorkspaceService);
  return ws.adminOrgs().length ? true : inject(Router).createUrlTree(['/']);
};

/** Native app without a chosen server: go to the "Connect to your server" screen first. */
export const serverGuard: CanActivateFn = () => {
  const server = inject(ServerConfigService);
  return server.needsSetup() ? inject(Router).createUrlTree(['/server']) : true;
};
