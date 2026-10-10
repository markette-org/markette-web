import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PlatformInfoService } from '../../core/platform-info.service';
import { NewOrgDialogComponent } from './new-org-dialog.component';
import { BillingCardComponent } from './billing-card.component';
import { OrgChannelsCardComponent } from './org-channels-card.component';
import { SsoCardComponent } from './sso-card.component';
import { AuthService } from '../../core/auth.service';
import { fieldErrors, formatError } from '../../core/errors';
import { Id, Invitation, OrgMember, OrgRole, Organization, Workspace } from '../../core/models';
import { OrganizationService, inviteLink } from '../../core/organization.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService, browserTimezone } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { allTimezones } from '../../shared/utils/dates';
import { fmtNumber } from '../../shared/utils/format';

interface Meter {
  key: string;
  label: string;
  icon: string;
  used: number;
  limit: number | null;
  unit: string;
}

const ORG_ROLE_HELP: Record<OrgRole, string> = {
  owner: 'Full control, including billing contacts and other owners. Acts as owner in every workspace.',
  admin: 'Manages workspaces, members and invitations. Acts as admin in every workspace.',
  member: 'Only the workspaces they are added to.',
};

@Component({
  selector: 'app-organization-page',
  imports: [FormsModule, NewOrgDialogComponent, BillingCardComponent, OrgChannelsCardComponent, SsoCardComponent, AvatarComponent, IconComponent, ModalComponent, RelativeTimePipe, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organization.page.html',
  styleUrl: './organization.page.scss',
})
export class OrganizationPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly auth = inject(AuthService);
  private readonly orgs = inject(OrganizationService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly platform = inject(PlatformInfoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly roleHelp = ORG_ROLE_HELP;
  protected readonly timezones = allTimezones();

  protected readonly orgId = signal<Id | null>(null);
  protected readonly org = computed<Organization | null>(() => this.ws.organizations().find((o) => o.id === this.orgId()) ?? null);
  protected readonly isAdmin = computed(() => this.org()?.role === 'owner' || this.org()?.role === 'admin');
  protected readonly roleLabel: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
  protected readonly canCreateOrg = computed(() => this.platform.orgCreationOpen() || !!this.auth.user()?.is_superadmin);
  protected readonly newOrgOpen = signal(false);
  protected readonly leaving = signal(false);
  protected readonly leaveError = signal('');
  protected readonly isOwner = computed(() => this.org()?.role === 'owner');
  protected readonly assignable = computed<OrgRole[]>(() => (this.isOwner() ? ['member', 'admin', 'owner'] : ['member', 'admin']));

  /* general */
  protected readonly name = signal('');
  protected readonly savingName = signal(false);
  protected readonly nameError = signal('');

  /* workspaces */
  protected readonly orgWorkspaces = computed<Workspace[]>(() =>
    this.ws
      .workspaces()
      .filter((w) => w.organization === this.orgId())
      .sort((a, b) => Number(!!a.is_archived) - Number(!!b.is_archived) || a.name.localeCompare(b.name)),
  );
  protected readonly busyWs = signal<Id | null>(null);
  protected readonly newWsOpen = signal(false);
  protected readonly newWsName = signal('');
  protected readonly newWsTz = signal(browserTimezone());
  protected readonly newWsError = signal('');
  protected readonly creatingWs = signal(false);

  /* members & invitations */
  protected readonly members = signal<OrgMember[]>([]);
  protected readonly membersLoading = signal(true);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly invEmail = signal('');
  protected readonly invRole = signal<OrgRole>('member');
  protected readonly inviting = signal(false);
  protected readonly invError = signal('');
  protected readonly lastInvite = signal<Id | null>(null);

  protected readonly meters = computed<Meter[]>(() => {
    const o = this.org();
    if (!o) return [];
    const u = o.usage;
    return [
      { key: 'workspaces', label: 'Active workspaces', icon: 'layers', used: u?.workspaces ?? o.workspace_count, limit: o.max_workspaces, unit: 'workspaces' },
      { key: 'channels', label: 'Channels', icon: 'channels', used: u?.channels ?? 0, limit: o.max_channels, unit: 'channels' },
      { key: 'members', label: 'People', icon: 'users', used: u?.members ?? 0, limit: o.max_members, unit: 'people' },
      { key: 'ai', label: 'AI tokens this month', icon: 'sparkles', used: u?.ai_tokens_this_month ?? 0, limit: o.ai_monthly_tokens, unit: 'tokens' },
    ];
  });

  constructor() {
    // Reload the per-org lists whenever the selected organization changes.
    effect(() => {
      const id = this.orgId();
      untracked(() => {
        const o = this.org();
        this.name.set(o?.name ?? '');
        this.leaveError.set('');
        if (id !== null && this.isAdmin()) this.loadPeople(id);
      });
    });
  }

  ngOnInit() {
    this.pickInitial();
    void this.ws.reloadOrganizations().then(
      () => {
        if (!this.org()) this.pickInitial();
      },
      () => undefined,
    );
  }

  private pickInitial() {
    const all = this.ws.organizations();
    const fromUrl = Number(this.route.snapshot.queryParamMap.get('org'));
    const current = this.ws.active()?.organization;
    const id =
      all.find((o) => o.id === fromUrl)?.id ??
      all.find((o) => o.id === current)?.id ??
      this.ws.adminOrgs()[0]?.id ??
      all[0]?.id ??
      null;
    this.orgId.set(id);
    if (id !== null && id !== fromUrl) this.syncUrl(id);
  }

  protected selectOrg(id: Id) {
    this.orgId.set(id);
    this.syncUrl(id);
  }

  private syncUrl(id: Id) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { org: id }, replaceUrl: true });
  }

  protected async leave(o: Organization) {
    this.leaveError.set('');
    const ok = await this.confirm.ask({
      title: `Leave ${o.name}?`,
      message: 'You lose access to all of its workspaces and teams right away. To come back, someone has to invite you again.',
      confirmLabel: 'Leave organization',
      danger: true,
      typeToConfirm: o.name,
    });
    if (!ok) return;
    this.leaving.set(true);
    this.ws.leaveOrganization(o.id).subscribe({
      next: () => {
        this.leaving.set(false);
        this.toast.success(`You left ${o.name}`);
        const next = this.ws.organizations()[0];
        this.orgId.set(next?.id ?? null);
        if (next) this.syncUrl(next.id);
        else this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      },
      error: (err) => {
        this.leaving.set(false);
        this.leaveError.set(formatError(err));
      },
    });
  }

  private loadPeople(id: Id) {
    this.membersLoading.set(true);
    this.orgs.members(id).subscribe({
      next: (m) => {
        this.members.set(m);
        this.membersLoading.set(false);
      },
      error: (err) => {
        this.membersLoading.set(false);
        this.toast.error('Could not load members', err);
      },
    });
    this.orgs.invitations(id).subscribe({ next: (i) => this.invitations.set(i), error: () => undefined });
  }

  /* --- meters ---------------------------------------------------------------------------- */

  protected pct(m: Meter): number {
    if (!m.limit) return m.limit === 0 ? 100 : 0;
    return Math.min(100, Math.round((m.used / m.limit) * 100));
  }

  protected level(m: Meter): 'ok' | 'near' | 'full' {
    if (m.limit === null) return 'ok';
    if (m.used >= m.limit) return 'full';
    return this.pct(m) >= 90 ? 'near' : 'ok';
  }

  protected n(v: number) {
    return fmtNumber(v);
  }

  /* --- general ----------------------------------------------------------------------------- */

  protected saveName() {
    const o = this.org();
    const name = this.name().trim();
    if (!o || !name) {
      this.nameError.set('The organization needs a name.');
      return;
    }
    this.savingName.set(true);
    this.nameError.set('');
    this.orgs.update(o.id, { name }).subscribe({
      next: () => {
        this.savingName.set(false);
        this.toast.success('Organization renamed');
        void this.ws.reload().catch(() => undefined);
      },
      error: (err) => {
        this.savingName.set(false);
        this.nameError.set(formatError(err));
      },
    });
  }

  /* --- workspaces --------------------------------------------------------------------------- */

  protected async setArchived(w: Workspace, archived: boolean) {
    const ok = await this.confirm.ask(
      archived
        ? {
            title: `Archive ${w.name}?`,
            message:
              'Archived workspaces are read-only: nothing can be edited or scheduled there, and they are hidden from the workspace switcher. They no longer count toward your workspace limit. You can restore it at any time.',
            confirmLabel: 'Archive workspace',
            danger: true,
          }
        : {
            title: `Restore ${w.name}?`,
            message: 'It becomes editable again and counts toward your plan’s workspace limit.',
            confirmLabel: 'Restore',
          },
    );
    if (!ok) return;
    this.busyWs.set(w.id);
    this.ws.setArchived(w.id, archived).subscribe({
      next: () => {
        this.busyWs.set(null);
        this.toast.success(archived ? 'Workspace archived' : 'Workspace restored', w.name);
      },
      error: (err) => {
        this.busyWs.set(null);
        this.toast.error(archived ? 'Could not archive' : 'Could not restore', err);
      },
    });
  }

  protected open(w: Workspace) {
    this.ws.switchTo(w.slug);
  }

  protected openNewWs() {
    this.newWsName.set('');
    this.newWsTz.set(this.ws.active()?.timezone || browserTimezone());
    this.newWsError.set('');
    this.newWsOpen.set(true);
  }

  protected createWs() {
    const o = this.org();
    const name = this.newWsName().trim();
    if (!o || !name) {
      this.newWsError.set('Give the workspace a name.');
      return;
    }
    this.creatingWs.set(true);
    this.newWsError.set('');
    this.ws.create({ name, timezone: this.newWsTz(), organization: o.id }).subscribe({
      next: (w) => {
        this.creatingWs.set(false);
        this.newWsOpen.set(false);
        this.toast.success('Workspace created', w.name);
      },
      error: (err) => {
        this.creatingWs.set(false);
        this.newWsError.set(formatError(err));
      },
    });
  }

  /* --- members ----------------------------------------------------------------------------- */

  protected canEdit(m: OrgMember): boolean {
    if (m.role === 'owner' && !this.isOwner()) return false;
    return true;
  }

  protected setRole(m: OrgMember, role: OrgRole) {
    const o = this.org();
    if (!o) return;
    const prev = m.role;
    this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));
    this.orgs.updateMember(o.id, m.id, role).subscribe({
      next: (u) => {
        this.members.update((list) => list.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
        this.toast.success('Role updated', `${m.user.name || m.user.email} is now ${role}.`);
        if (m.user.id === this.auth.user()?.id) void this.ws.reload().catch(() => undefined);
      },
      error: (err) => {
        this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role: prev } : x)));
        this.toast.error('Could not change role', err);
      },
    });
  }

  protected async removeMember(m: OrgMember) {
    const o = this.org();
    if (!o) return;
    const self = m.user.id === this.auth.user()?.id;
    const ok = await this.confirm.ask({
      title: self ? `Leave ${o.name}?` : `Remove ${m.user.name || m.user.email}?`,
      message: `${self ? 'You' : 'They'} will lose access to the organization and all of its workspaces.`,
      confirmLabel: self ? 'Leave organization' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    this.orgs.removeMember(o.id, m.id).subscribe({
      next: () => {
        this.members.update((list) => list.filter((x) => x.id !== m.id));
        this.toast.success(self ? 'You left the organization' : 'Member removed');
        if (self) void this.ws.reload().catch(() => undefined);
      },
      error: (err) => this.toast.error('Could not remove member', err),
    });
  }

  /* --- invitations ---------------------------------------------------------------------------- */

  protected link(i: Invitation) {
    return inviteLink(i.token, i.email);
  }

  protected invite() {
    const o = this.org();
    const email = this.invEmail().trim();
    if (!o) return;
    if (!email) {
      this.invError.set('Enter an email address.');
      return;
    }
    this.inviting.set(true);
    this.invError.set('');
    this.orgs.invite(o.id, email, this.invRole()).subscribe({
      next: (i) => {
        this.inviting.set(false);
        this.invEmail.set('');
        this.invitations.update((list) => [i, ...list]);
        this.lastInvite.set(i.id);
        this.copy(i);
      },
      error: (err) => {
        this.inviting.set(false);
        const { fields, general } = fieldErrors(err);
        this.invError.set([general, ...Object.values(fields)].filter(Boolean).join('\n'));
      },
    });
  }

  protected copy(i: Invitation) {
    const url = this.link(i);
    const done = () => this.toast.success('Invite link copied', `Send it to ${i.email}. No email is sent.`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => this.toast.info('Copy the invite link', url));
    else this.toast.info('Copy the invite link', url);
  }

  protected async revoke(i: Invitation) {
    const o = this.org();
    if (!o) return;
    const ok = await this.confirm.ask({ title: `Revoke invitation for ${i.email}?`, message: 'The invite link will stop working.', confirmLabel: 'Revoke', danger: true });
    if (!ok) return;
    this.orgs.revokeInvitation(o.id, i.id).subscribe({
      next: () => this.invitations.update((list) => list.filter((x) => x.id !== i.id)),
      error: (err) => this.toast.error('Could not revoke', err),
    });
  }
}
