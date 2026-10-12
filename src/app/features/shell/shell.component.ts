import { ChangeDetectionStrategy, DestroyRef, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { PlatformInfoService } from '../../core/platform-info.service';
import { ShareIntakeService } from '../../core/native/share-intake.service';
import { isNative } from '../../core/native/platform';
import { formatError } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService, browserTimezone } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { NewOrgDialogComponent } from '../organization/new-org-dialog.component';
import { allTimezones } from '../../shared/utils/dates';
import { Workspace } from '../../core/models';
import { InboxService } from '../../core/inbox.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  write?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, AvatarComponent, ModalComponent, FormsModule, NewOrgDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  protected readonly platform = inject(PlatformInfoService);
  private readonly share = inject(ShareIntakeService);
  protected readonly isNativeApp = isNative();
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly inbox = inject(InboxService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
    { path: '/compose', label: 'Compose', icon: 'compose', write: true },
    { path: '/calendar', label: 'Calendar', icon: 'calendar' },
    { path: '/posts', label: 'Posts', icon: 'posts' },
    { path: '/inbox', label: 'Inbox', icon: 'inbox' },
    { path: '/analytics', label: 'Analytics', icon: 'analytics' },
    { path: '/best-times', label: 'Best times', icon: 'clock' },
    { path: '/campaigns', label: 'Campaigns', icon: 'flag' },
    { path: '/channels', label: 'Channels', icon: 'channels' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  protected readonly sidebarOpen = signal(false);
  protected readonly wsMenu = signal(false);
  protected readonly userMenu = signal(false);
  protected readonly createOpen = signal(false);
  protected readonly creating = signal(false);
  protected readonly createError = signal('');
  protected readonly newName = signal('');
  protected readonly newTz = signal(browserTimezone());
  protected readonly newOrg = signal<number | null>(null);
  protected readonly showArchived = signal(false);
  protected readonly newOrgOpen = signal(false);
  protected readonly canCreateOrg = computed(() => this.platform.orgCreationOpen() || !!this.auth.user()?.is_superadmin);
  protected readonly url = signal('/');

  protected readonly platformNav: NavItem[] = [
    { path: '/platform', label: 'Overview', icon: 'analytics', exact: true },
    { path: '/platform/organizations', label: 'Organizations', icon: 'layers' },
    { path: '/platform/users', label: 'Users', icon: 'users' },
    { path: '/platform/health', label: 'Health', icon: 'zap' },
    { path: '/platform/ai-usage', label: 'AI usage', icon: 'sparkles' },
    { path: '/platform/plans', label: 'Plans', icon: 'tag' },
    { path: '/platform/settings', label: 'Settings', icon: 'settings' },
  ];

  /** Workspaces grouped by organization for the switcher. */
  protected readonly groups = computed(() => {
    const show = this.showArchived();
    const map = new Map<string, { key: string; name: string; workspaces: Workspace[] }>();
    for (const w of this.ws.workspaces()) {
      if (w.is_archived && !show && w.slug !== this.ws.slug()) continue;
      const key = String(w.organization ?? 'none');
      if (!map.has(key)) map.set(key, { key, name: w.organization_name || 'Workspaces', workspaces: [] });
      map.get(key)!.workspaces.push(w);
    }
    return [...map.values()];
  });
  protected readonly archivedCount = computed(() => this.ws.workspaces().filter((w) => w.is_archived).length);
  protected readonly isSuperadmin = computed(() => !!this.auth.user()?.is_superadmin);
  /** Pages that work without an active workspace. */
  protected readonly workspaceFree = computed(() => /^\/(platform|organization)(\/|$|\?)/.test(this.url()));
  protected readonly suspendedName = computed(() => {
    if (this.ws.blocked() === 'suspended') return this.ws.organization()?.name || this.ws.active()?.organization_name || 'This organization';
    const s = this.ws.suspendedOrgs();
    return !this.ws.active() && s.length ? s.map((o) => o.name).join(', ') : null;
  });
  protected readonly timezones = allTimezones();

  protected readonly visibleNav = computed(() => this.nav.filter((n) => !n.write || this.ws.canWrite()));
  protected readonly reauthCount = computed(() => this.catalog.needsReauth().length);
  protected readonly userName = computed(() => this.auth.user()?.name || this.auth.user()?.email || '');

  ngOnInit() {
    // A share received before sign-in resumes here.
    void this.share.resume();
    this.auth.loadMe().subscribe({
      next: (u) => {
        if (u.is_superadmin) this.platform.ensureSettings();
      },
      error: () => undefined,
    });
    if (this.ws.active()) this.catalog.loadChannels().subscribe({ error: () => undefined });
    if (this.ws.active()) this.inbox.refresh();
    const timer = setInterval(() => {
      if (this.ws.active() && document.visibilityState === 'visible') this.inbox.refresh();
    }, 90_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    this.url.set(this.router.url);
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.url.set(this.router.url);
      this.sidebarOpen.set(false);
      this.wsMenu.set(false);
      this.userMenu.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  protected closeMenus() {
    this.wsMenu.set(false);
    this.userMenu.set(false);
    this.sidebarOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (!t.closest('.ws-switcher')) this.wsMenu.set(false);
    if (!t.closest('.user-menu')) this.userMenu.set(false);
  }

  protected switchTo(slug: string) {
    this.wsMenu.set(false);
    this.ws.switchTo(slug);
  }

  protected openCreate() {
    this.wsMenu.set(false);
    this.newName.set('');
    this.newTz.set(this.ws.active()?.timezone || browserTimezone());
    const admin = this.ws.adminOrgs();
    const current = this.ws.active()?.organization;
    this.newOrg.set(admin.find((o) => o.id === current)?.id ?? admin[0]?.id ?? null);
    this.createError.set('');
    this.createOpen.set(true);
  }

  protected createWorkspace() {
    const name = this.newName().trim();
    if (!name) {
      this.createError.set('Give the workspace a name.');
      return;
    }
    this.creating.set(true);
    this.ws.create({ name, timezone: this.newTz(), organization: this.newOrg() ?? undefined }).subscribe({
      next: (w) => {
        this.creating.set(false);
        this.createOpen.set(false);
        this.toast.success('Workspace created', `Switched to ${w.name}.`);
        this.ws.switchTo(w.slug);
      },
      error: (err) => {
        this.creating.set(false);
        this.createError.set(formatError(err));
      },
    });
  }

  protected openNewOrg() {
    this.wsMenu.set(false);
    this.userMenu.set(false);
    this.newOrgOpen.set(true);
  }

  protected logout() {
    this.ws.clear();
    this.auth.logout();
  }
}
