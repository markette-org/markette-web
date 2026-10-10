import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fieldErrors, formatError } from '../../core/errors';
import { Id, Organization, Role, SsoConfig, SsoConfigWrite, SsoDomain } from '../../core/models';
import { OrganizationService } from '../../core/organization.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';

interface Draft {
  enabled: boolean;
  issuer: string;
  client_id: string;
  scopes: string;
  auto_provision: boolean;
  default_org_role: 'member' | 'admin';
  default_workspace: Id | null;
  default_workspace_role: Role;
  enforce: boolean;
}

const EXAMPLES = [
  { name: 'Google', url: 'https://accounts.google.com' },
  { name: 'Microsoft Entra', url: 'https://login.microsoftonline.com/<tenant-id>/v2.0' },
  { name: 'Okta', url: 'https://<org>.okta.com' },
  { name: 'Keycloak', url: 'https://<host>/realms/<realm>' },
  { name: 'Auth0', url: 'https://<tenant>.auth0.com/' },
];

/** Organization single sign-on (OpenID Connect), configured by org owners. */
@Component({
  selector: 'app-sso-card',
  imports: [FormsModule, IconComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'sso' },
  templateUrl: './sso-card.component.html',
  styleUrl: './sso-card.component.scss',
})
export class SsoCardComponent {
  readonly org = input.required<Organization>();

  private readonly orgs = inject(OrganizationService);
  private readonly ws = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly examples = EXAMPLES;
  protected readonly isOwner = computed(() => this.org().role === 'owner');
  protected readonly cfg = signal<SsoConfig | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly draft = signal<Draft | null>(null);
  protected readonly secretEditing = signal(false);
  protected readonly secret = signal('');
  protected readonly saving = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');
  protected readonly showAdvanced = signal(false);

  protected readonly newDomain = signal('');
  protected readonly addingDomain = signal(false);
  protected readonly domainError = signal('');
  protected readonly domainBusy = signal<Id | null>(null);
  protected readonly domainRowError = signal<Record<number, string>>({});

  protected readonly orgWorkspaces = computed(() => this.ws.workspaces().filter((w) => w.organization === this.org().id && !w.is_archived));
  protected readonly hasVerified = computed(() => (this.cfg()?.domains ?? []).some((d) => d.verified));
  protected readonly canEnforce = computed(() => !!this.draft()?.enabled && this.hasVerified());

  protected readonly dirty = computed(() => {
    const c = this.cfg();
    const d = this.draft();
    if (!c || !d) return false;
    if (this.secretEditing() && this.secret().trim()) return true;
    return (Object.keys(d) as (keyof Draft)[]).some((k) => (d[k] ?? null) !== (c[k] ?? null));
  });

  constructor() {
    effect(() => {
      const o = this.org();
      untracked(() => {
        if (o.role === 'owner') this.load(o.id);
      });
    });
  }

  private load(id: Id) {
    this.loading.set(true);
    this.loadError.set('');
    this.orgs.sso(id).subscribe({
      next: (c) => {
        this.loading.set(false);
        this.hydrate(c);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  private hydrate(c: SsoConfig) {
    this.cfg.set(c);
    this.draft.set({
      enabled: c.enabled,
      issuer: c.issuer,
      client_id: c.client_id,
      scopes: c.scopes || 'openid email profile',
      auto_provision: c.auto_provision,
      default_org_role: c.default_org_role,
      default_workspace: c.default_workspace,
      default_workspace_role: c.default_workspace_role,
      enforce: c.enforce,
    });
    this.secretEditing.set(false);
    this.secret.set('');
  }

  protected set<K extends keyof Draft>(key: K, value: Draft[K]) {
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
    if (this.fe()[key]) this.fe.update((e) => ({ ...e, [key]: '' }));
    if (key === 'enabled' && !value) this.draft.update((d) => (d ? { ...d, enforce: false } : d));
  }

  protected discard() {
    const c = this.cfg();
    if (c) this.hydrate(c);
    this.fe.set({});
    this.general.set('');
  }

  protected save(extra: Partial<SsoConfigWrite> = {}) {
    const d = this.draft();
    if (!d) return;
    if (!d.issuer.trim() || !d.client_id.trim()) {
      this.fe.set({ issuer: d.issuer.trim() ? '' : 'Required.', client_id: d.client_id.trim() ? '' : 'Required.' });
      return;
    }
    const body: SsoConfigWrite = {
      enabled: d.enabled,
      issuer: d.issuer.trim(),
      client_id: d.client_id.trim(),
      scopes: d.scopes.trim() || 'openid email profile',
      auto_provision: d.auto_provision,
      default_org_role: d.default_org_role,
      default_workspace: d.default_workspace,
      default_workspace_role: d.default_workspace_role,
      enforce: d.enforce && this.canEnforce(),
      ...extra,
    };
    if (this.secretEditing() && this.secret().trim() && !('client_secret' in extra)) body.client_secret = this.secret().trim();
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    this.orgs.saveSso(this.org().id, body).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.hydrate(c);
        this.toast.success('Single sign-on saved', c.enabled ? 'Members on your domains can now sign in with SSO.' : undefined);
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        this.general.set(general);
      },
    });
  }

  protected async clearSecret() {
    const ok = await this.confirm.ask({
      title: 'Clear the client secret?',
      message: 'Sign-in stops working with identity providers that require a client secret until you set a new one.',
      confirmLabel: 'Clear secret',
      danger: true,
    });
    if (ok) this.save({ client_secret: '' });
  }

  /* --- domains ---------------------------------------------------------------------- */

  protected addDomain() {
    const domain = this.newDomain().trim().toLowerCase().replace(/^@/, '');
    if (!domain) return;
    this.addingDomain.set(true);
    this.domainError.set('');
    this.orgs.addSsoDomain(this.org().id, domain).subscribe({
      next: (c) => {
        this.addingDomain.set(false);
        this.newDomain.set('');
        this.cfg.set(c);
        this.toast.success('Domain added', 'Create the TXT record below, then click Verify.');
      },
      error: (err) => {
        this.addingDomain.set(false);
        const { fields, general } = fieldErrors(err);
        this.domainError.set(fields['domain'] || general || formatError(err));
      },
    });
  }

  protected verify(d: SsoDomain) {
    this.domainBusy.set(d.id);
    this.domainRowError.update((e) => ({ ...e, [d.id]: '' }));
    this.orgs.verifySsoDomain(this.org().id, d.id).subscribe({
      next: (c) => {
        this.domainBusy.set(null);
        this.cfg.set(c);
        this.toast.success(`${d.domain} verified`);
      },
      error: (err) => {
        this.domainBusy.set(null);
        this.domainRowError.update((e) => ({ ...e, [d.id]: formatError(err) }));
      },
    });
  }

  protected async removeDomain(d: SsoDomain) {
    const lastVerified = d.verified && (this.cfg()?.domains ?? []).filter((x) => x.verified).length === 1;
    const ok = await this.confirm.ask({
      title: `Remove ${d.domain}?`,
      message:
        'People with this domain no longer get SSO.' +
        (lastVerified && this.cfg()?.enforce ? ' This is the last verified domain, so SSO enforcement is turned off.' : ''),
      confirmLabel: 'Remove domain',
      danger: true,
    });
    if (!ok) return;
    this.domainBusy.set(d.id);
    this.orgs.removeSsoDomain(this.org().id, d.id).subscribe({
      next: (c) => {
        this.domainBusy.set(null);
        const prev = this.draft();
        this.cfg.set(c);
        if (prev) this.draft.set({ ...prev, enforce: c.enforce && prev.enforce });
      },
      error: (err) => {
        this.domainBusy.set(null);
        this.toast.error('Could not remove domain', err);
      },
    });
  }

  protected async copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(`${what} copied`);
    } catch {
      this.toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  }
}
