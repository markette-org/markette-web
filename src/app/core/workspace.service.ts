import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, from, map, switchMap, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Id, OrgCreateResponse, Organization, Role, Workspace } from './models';
import { storage } from './storage';

const KEY = 'mk.workspace';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A ?ws=<slug> in the address (links from the browser extension) picks the workspace on load. */
function initialSlug(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('ws');
  if (fromUrl && /^[\w-]{1,100}$/.test(fromUrl)) {
    storage.set(KEY, fromUrl);
    return fromUrl;
  }
  return storage.get(KEY);
}

/** Why the tenant area is blocked (set by the HTTP interceptor on 403s). */
export type BlockReason = 'suspended' | null;

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly workspaces = signal<Workspace[]>([]);
  readonly organizations = signal<Organization[]>([]);
  readonly loaded = signal(false);
  readonly activeSlug = signal<string | null>(initialSlug());
  /** Bumps on every workspace switch; feature pages can depend on it to reload. */
  readonly epoch = signal(0);
  /** Set when the API says the organization is suspended. */
  readonly blocked = signal<BlockReason>(null);

  readonly active = computed<Workspace | null>(() => {
    const list = this.workspaces();
    const slug = this.activeSlug();
    return list.find((w) => w.slug === slug) ?? list.find((w) => !w.is_archived) ?? list[0] ?? null;
  });
  readonly slug = computed(() => this.active()?.slug ?? null);
  readonly role = computed<Role>(() => this.active()?.role ?? 'viewer');
  readonly timezone = computed(() => this.active()?.timezone || browserTimezone());
  readonly archived = computed(() => !!this.active()?.is_archived);
  /** Can create/edit content: editor+ in a workspace that is not archived. */
  readonly canWrite = computed(() => RANK[this.role()] >= RANK.editor && !this.archived());
  readonly isAdmin = computed(() => RANK[this.role()] >= RANK.admin);
  readonly isOwner = computed(() => this.role() === 'owner');
  /** Server-wide AI switch as reported on the workspace (null until loaded). */
  readonly serverAi = computed<boolean | null>(() => this.active()?.ai_available ?? null);
  readonly aiEnabled = computed(() => !!this.active()?.ai_enabled && this.active()?.ai_available !== false);

  /** Organization of the active workspace. */
  readonly organization = computed<Organization | null>(() => {
    const id = this.active()?.organization;
    return this.organizations().find((o) => o.id === id) ?? null;
  });
  /** Organizations where the user is owner/admin (can create workspaces, manage the org). */
  readonly adminOrgs = computed(() => this.organizations().filter((o) => o.role === 'owner' || o.role === 'admin'));
  readonly isOrgAdmin = computed(() => {
    const r = this.active()?.organization_role ?? this.organization()?.role;
    return r === 'owner' || r === 'admin';
  });
  readonly suspendedOrgs = computed(() => this.organizations().filter((o) => o.status === 'suspended'));

  private loading: Promise<void> | null = null;

  hasRole(role: Role): boolean {
    return RANK[this.role()] >= RANK[role];
  }

  /** Loads workspaces once (guards call this before entering the app). */
  ensureLoaded(): Promise<void> {
    if (this.loaded()) return Promise.resolve();
    return this.reload();
  }

  reload(): Promise<void> {
    if (!this.loading) {
      const ws = firstValueFrom(this.api.get<Workspace[] | { results: Workspace[] }>('workspaces/', { limit: 500 }));
      const orgs = firstValueFrom(this.api.get<Organization[] | { results: Organization[] }>('organizations/', { limit: 200 })).catch(
        () => [] as Organization[],
      );
      this.loading = Promise.all([ws, orgs])
        .then(([wsRes, orgRes]) => {
          const list = Array.isArray(wsRes) ? wsRes : wsRes.results;
          this.organizations.set(Array.isArray(orgRes) ? orgRes : orgRes.results);
          this.workspaces.set(list);
          this.loaded.set(true);
          const slug = this.activeSlug();
          if (!list.some((w) => w.slug === slug) && list.length) {
            this.persist((list.find((w) => !w.is_archived) ?? list[0]).slug);
          }
        })
        .finally(() => (this.loading = null));
    }
    return this.loading;
  }

  reloadOrganizations(): Promise<void> {
    return firstValueFrom(this.api.get<Organization[] | { results: Organization[] }>('organizations/', { limit: 200 })).then(
      (res) => this.organizations.set(Array.isArray(res) ? res : res.results),
    );
  }

  /** Selects a workspace without navigating (callers navigate themselves). */
  setActive(slug: string) {
    this.persist(slug);
    this.blocked.set(null);
    this.epoch.update((n) => n + 1);
  }

  private persist(slug: string) {
    this.activeSlug.set(slug);
    storage.set(KEY, slug);
  }

  /** Switches the active workspace and re-renders the current page with fresh data. */
  switchTo(slug: string) {
    if (slug === this.slug()) return;
    this.setActive(slug);
    const url = this.router.url;
    this.router.navigateByUrl('/switching', { skipLocationChange: true }).then(() => {
      // Detail pages may not exist in the other workspace; go to the section root instead.
      const section = '/' + (url.split('?')[0].split('/')[1] ?? '');
      const safe = /^\/(posts|campaigns|channels)\/.+/.test(url) || url.startsWith('/channels/connect') ? section : url;
      this.router.navigateByUrl(safe.startsWith('/compose') && !this.canWrite() ? '/' : safe);
    });
  }

  create(data: Pick<Workspace, 'name' | 'timezone'> & { organization?: Id }): Observable<Workspace> {
    return this.api.post<Workspace>('workspaces/', data).pipe(
      tap((ws) => {
        const created = { ...ws, role: ws.role ?? 'owner' };
        this.workspaces.update((list) => [...list, created]);
        void this.reloadOrganizations().catch(() => undefined);
      }),
    );
  }

  update(id: number, patch: Partial<Workspace> & { archived?: boolean }): Observable<Workspace> {
    return this.api.patch<Workspace>(`workspaces/${id}/`, patch).pipe(
      tap((ws) => {
        this.workspaces.update((list) => list.map((w) => (w.id === ws.id ? { ...w, ...ws, role: ws.role ?? w.role } : w)));
        if ('archived' in patch) void this.reloadOrganizations().catch(() => undefined);
      }),
    );
  }

  setArchived(id: number, archived: boolean): Observable<Workspace> {
    return this.update(id, { archived });
  }

  /** Creates an organization (+ its first workspace) and makes it active. */
  createOrganization(data: { name: string; workspace_name?: string; timezone?: string }): Observable<OrgCreateResponse> {
    return this.api.post<OrgCreateResponse>('organizations/', data).pipe(
      switchMap((res) =>
        from(this.reload().catch(() => undefined)).pipe(
          map(() => {
            this.setActive(res.workspace.slug);
            return res;
          }),
        ),
      ),
    );
  }

  /** Leaves an organization; falls back to another workspace when the active one disappears. */
  leaveOrganization(id: Id): Observable<void> {
    const wasActive = this.active()?.organization === id;
    return this.api.post<void>(`organizations/${id}/leave/`).pipe(
      switchMap(() => from(this.reload().catch(() => undefined))),
      map(() => {
        if (wasActive) {
          const next = this.workspaces().find((w) => !w.is_archived) ?? this.workspaces()[0];
          if (next) this.setActive(next.slug);
          else this.epoch.update((n) => n + 1);
        }
      }),
    );
  }

  remove(id: number): Observable<void> {
    return this.api.delete<void>(`workspaces/${id}/`).pipe(
      tap(() => {
        this.workspaces.update((list) => list.filter((w) => w.id !== id));
        const first = this.workspaces().find((w) => !w.is_archived) ?? this.workspaces()[0];
        if (first) this.persist(first.slug);
        this.epoch.update((n) => n + 1);
      }),
    );
  }

  clear() {
    this.workspaces.set([]);
    this.organizations.set([]);
    this.loaded.set(false);
    this.blocked.set(null);
  }
}
