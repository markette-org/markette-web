import { ServerConfigService } from '../../core/server-config.service';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { formatError } from '../../core/errors';
import {
  AnnouncementLevel,
  OverrideValue,
  PlatformSettings,
  PlatformSettingsPatch,
  TestAiResult,
} from '../../core/models';
import { PlatformInfoService } from '../../core/platform-info.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { PlatformHeaderComponent } from './platform-header.component';
import { copyText } from './platform-utils';

type SectionKey = 'general' | 'announcement' | 'signups' | 'plan' | 'publishing' | 'ai' | 'x' | 'linkedin' | 'meta' | 'threads' | 'youtube' | 'mastodon' | 'billing';
type LimitKey = 'default_max_workspaces' | 'default_max_channels' | 'default_max_members' | 'default_ai_monthly_tokens';

interface OverrideField {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'bool' | 'effort' | 'output' | 'provider';
  hint?: string;
  step?: string;
  min?: number;
  max?: number;
}

const SECTION_OVERRIDES: Partial<Record<SectionKey, OverrideField[]>> = {
  publishing: [
    { name: 'PUBLISH_MAX_ATTEMPTS', label: 'Max publish attempts', kind: 'number', min: 1, max: 20, step: '1', hint: 'Retries with back-off before a publication is marked failed (1–20).' },
  ],
  ai: [
    { name: 'AI_PROVIDER', label: 'Provider', kind: 'provider' },
    { name: 'AI_BASE_URL', label: 'Base URL', kind: 'text' },
    { name: 'AI_MODEL', label: 'Model', kind: 'text' },
    { name: 'AI_EFFORT', label: 'Reasoning effort', kind: 'effort', hint: 'Only for models that support reasoning. Higher effort thinks longer and uses more tokens.' },
    {
      name: 'AI_STRUCTURED_OUTPUT',
      label: 'Structured output mode',
      kind: 'output',
      hint: 'JSON schema (recommended) / JSON mode / Instructions only — use a lower mode if your server rejects structured output; Markette falls back automatically from JSON schema to JSON mode.',
    },
    {
      name: 'AI_PRICE_INPUT_PER_MTOK',
      label: 'Estimated input price (USD / million tokens)',
      kind: 'number',
      step: '0.01',
      min: 0,
      hint: 'Only used when the provider does not report cost (OpenRouter does).',
    },
    {
      name: 'AI_PRICE_OUTPUT_PER_MTOK',
      label: 'Estimated output price (USD / million tokens)',
      kind: 'number',
      step: '0.01',
      min: 0,
      hint: 'Only used when the provider does not report cost (OpenRouter does).',
    },
  ],
  x: [{ name: 'X_CLIENT_ID', label: 'Client ID', kind: 'text' }],
  linkedin: [
    { name: 'LINKEDIN_CLIENT_ID', label: 'Client ID', kind: 'text' },
    { name: 'LINKEDIN_API_VERSION', label: 'API version', kind: 'text', hint: 'LinkedIn-Version header, e.g. 202409.' },
    {
      name: 'LINKEDIN_ORG_SCOPES',
      label: 'Company pages (organization scopes)',
      kind: 'bool',
      hint: 'Requests organization scopes so company pages can be connected. Needs the Community Management API product approved on your LinkedIn app.',
    },
  ],
  meta: [
    { name: 'META_APP_ID', label: 'App ID', kind: 'text' },
    { name: 'META_GRAPH_VERSION', label: 'Graph API version', kind: 'text', hint: 'e.g. v21.0' },
  ],
  threads: [{ name: 'THREADS_APP_ID', label: 'Threads app ID', kind: 'text', hint: 'Meta App → Use cases → Access the Threads API → Threads app ID.' }],
  youtube: [{ name: 'GOOGLE_CLIENT_ID', label: 'OAuth client ID', kind: 'text', hint: 'Google Cloud → APIs & Services → Credentials → OAuth client (Web application).' }],
  mastodon: [{ name: 'MASTODON_APP_NAME', label: 'App name', kind: 'text', hint: 'Shown on Mastodon servers as the posting application.' }],
};

const SECTION_SECRETS: Partial<Record<SectionKey, { name: string; label: string }[]>> = {
  ai: [{ name: 'AI_API_KEY', label: 'API key' }],
  x: [{ name: 'X_CLIENT_SECRET', label: 'Client secret' }],
  linkedin: [{ name: 'LINKEDIN_CLIENT_SECRET', label: 'Client secret' }],
  meta: [{ name: 'META_APP_SECRET', label: 'App secret' }],
  threads: [{ name: 'THREADS_APP_SECRET', label: 'Threads app secret' }],
  youtube: [{ name: 'GOOGLE_CLIENT_SECRET', label: 'OAuth client secret' }],
  billing: [
    { name: 'STRIPE_SECRET_KEY', label: 'Secret key' },
    { name: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret' },
  ],
};

/** Help text shown under a secret field. */
export const SECRET_HINTS: Record<string, string> = {
  STRIPE_SECRET_KEY: 'Starts with sk_live_ (or sk_test_ for test mode). Stripe → Developers → API keys.',
  STRIPE_WEBHOOK_SECRET: 'Starts with whsec_. Shown on the webhook endpoint page in Stripe.',
};

const LIMITS: { key: LimitKey; label: string; unit: string }[] = [
  { key: 'default_max_workspaces', label: 'Workspaces', unit: 'active workspaces' },
  { key: 'default_max_channels', label: 'Channels', unit: 'connected channels' },
  { key: 'default_max_members', label: 'People', unit: 'people' },
  { key: 'default_ai_monthly_tokens', label: 'AI tokens / month', unit: 'tokens' },
];

export const NETWORK_APPS: { key: SectionKey; provider: string; label: string; callback: string; note?: string }[] = [
  { key: 'x', provider: 'x', label: 'X', callback: 'x' },
  { key: 'linkedin', provider: 'linkedin', label: 'LinkedIn', callback: 'linkedin' },
  { key: 'meta', provider: 'facebook', label: 'Meta (Facebook & Instagram)', callback: 'facebook', note: 'One redirect URI serves both Facebook and Instagram.' },
  { key: 'threads', provider: 'threads', label: 'Threads', callback: 'threads', note: 'Add this as a redirect callback URL in the Threads use case settings of your Meta app.' },
  {
    key: 'youtube',
    provider: 'youtube',
    label: 'Google (YouTube)',
    callback: 'youtube',
    note: 'Google Cloud: enable YouTube Data API v3, create an OAuth client (Web), request the YouTube API audit for public uploads.',
  },
  { key: 'mastodon', provider: 'mastodon', label: 'Mastodon', callback: '', note: 'The app registers itself on each Mastodon server automatically; only the app name is configurable.' },
];

function overrideToDraft(v: OverrideValue | undefined, kind: OverrideField['kind']): string {
  if (v === null || v === undefined || v === '') return kind === 'bool' ? 'auto' : '';
  if (kind === 'bool') return v ? 'true' : 'false';
  return String(v);
}

function draftToOverride(d: string, kind: OverrideField['kind']): OverrideValue | '' {
  if (kind === 'bool') return d === 'auto' ? '' : d === 'true';
  if (kind === 'number') return d.trim() === '' ? '' : Number(d);
  return d.trim();
}

@Component({
  selector: 'app-platform-settings-page',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, PlatformHeaderComponent, IconComponent, ProviderIconComponent, TzDatePipe, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class PlatformSettingsPage implements OnInit {
  private readonly info = inject(PlatformInfoService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);

  protected readonly overrideFields = SECTION_OVERRIDES;
  protected readonly secretFields = SECTION_SECRETS;
  protected readonly secretHints = SECRET_HINTS;
  protected readonly stripeEvents = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ];
  protected readonly webhookUrl = computed(() => this.data()?.stripe_webhook_url || `${this.origin}/api/billing/webhook/`);
  protected readonly limits = LIMITS;
  protected readonly networks = NETWORK_APPS;
  protected readonly efforts = computed(() => this.data()?.ai_efforts ?? ['minimal', 'low', 'medium', 'high']);
  protected readonly providers = computed(() => this.data()?.ai_providers ?? ['openrouter', 'openai_compatible']);
  protected readonly outputModes = computed(() => this.data()?.ai_output_modes ?? ['json_schema', 'json_object', 'prompt']);
  protected readonly providerLabel: Record<string, string> = { openrouter: 'OpenRouter', openai_compatible: 'Custom OpenAI-compatible API' };
  protected readonly outputLabel: Record<string, string> = { json_schema: 'JSON schema (recommended)', json_object: 'JSON mode', prompt: 'Instructions only' };
  /** Fields of the AI card rendered by the generic override template (provider, URL and model have custom UI). */
  protected readonly aiGenericFields = (SECTION_OVERRIDES.ai ?? []).filter((f) => !['AI_PROVIDER', 'AI_BASE_URL', 'AI_MODEL'].includes(f.name));
  /** Provider in effect for the form: the draft if set, else the effective value. */
  protected readonly aiProvider = computed(() => this.ovr()['AI_PROVIDER'] || this.effective('AI_PROVIDER') || 'openrouter');
  protected readonly modelExamples = computed(() =>
    this.aiProvider() === 'openrouter'
      ? 'openrouter/auto, anthropic/claude-sonnet-4, openai/gpt-4o, meta-llama/llama-3.3-70b-instruct'
      : 'gpt-4o-mini (OpenAI), your Azure deployment name, llama3.1 (Ollama), the model path served by vLLM',
  );
  protected readonly origin = inject(ServerConfigService).publicOrigin();

  protected readonly data = signal<PlatformSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal<SectionKey | null>(null);
  protected readonly errors = signal<Record<string, string>>({});

  /* drafts */
  protected readonly instanceName = signal('');
  protected readonly supportEmail = signal('');
  protected readonly announcement = signal('');
  protected readonly level = signal<AnnouncementLevel>('info');
  protected readonly signupsOpen = signal(true);
  protected readonly orgCreationOpen = signal(true);
  protected readonly domains = signal<string[]>([]);
  protected readonly domainInput = signal('');
  protected readonly limitDraft = signal<Record<LimitKey, { value: string; unlimited: boolean }>>({
    default_max_workspaces: { value: '', unlimited: true },
    default_max_channels: { value: '', unlimited: true },
    default_max_members: { value: '', unlimited: true },
    default_ai_monthly_tokens: { value: '', unlimited: true },
  });
  protected readonly ovr = signal<Record<string, string>>({});
  protected readonly secretDraft = signal<Record<string, string>>({});
  protected readonly secretEditing = signal<Record<string, boolean>>({});
  protected readonly aiEnabled = signal<'auto' | 'true' | 'false'>('auto');

  protected readonly testing = signal(false);
  protected readonly testResult = signal<TestAiResult | null>(null);
  protected readonly pausing = signal(false);

  /* --- dirty tracking per section --------------------------------------------------- */
  protected readonly dirty = computed<Record<SectionKey, boolean>>(() => {
    const d = this.data();
    const out = {} as Record<SectionKey, boolean>;
    if (!d) return out;
    out.general = this.instanceName() !== d.instance_name || this.supportEmail() !== (d.support_email || '');
    out.announcement = this.announcement() !== (d.announcement || '') || this.level() !== d.announcement_level;
    out.signups = this.signupsOpen() !== d.signups_open || this.orgCreationOpen() !== d.org_creation_open || this.domains().join(', ') !== this.splitDomains(d.signup_domains).join(', ');
    out.plan = LIMITS.some(({ key }) => this.limitValue(key) !== d[key]);
    for (const key of ['publishing', 'ai', 'x', 'linkedin', 'meta', 'threads', 'youtube', 'mastodon', 'billing'] as SectionKey[]) {
      const fields = SECTION_OVERRIDES[key] ?? [];
      let changed = fields.some((f) => this.ovr()[f.name] !== overrideToDraft(d.overrides[f.name]?.value, f.kind));
      changed ||= (SECTION_SECRETS[key] ?? []).some((s) => !!this.secretDraft()[s.name]?.trim());
      if (key === 'ai') changed ||= this.aiEnabled() !== overrideToDraft(d.overrides['AI_ENABLED']?.value, 'bool');
      out[key] = changed;
    }
    return out;
  });

  protected isDirty(key: string): boolean {
    return !!this.dirty()[key as SectionKey];
  }

  protected readonly announcementPreview = computed(() => this.announcement().trim());

  ngOnInit() {
    this.info.loadSettings().subscribe({
      next: (s) => {
        this.hydrate(s);
        this.loading.set(false);
        const frag = this.route.snapshot.fragment;
        if (frag) setTimeout(() => document.getElementById(frag)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  private splitDomains(v: string): string[] {
    return (v || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }

  /** Reset drafts of the given sections (all when omitted) from server data. */
  private hydrate(s: PlatformSettings, only?: SectionKey) {
    this.data.set(s);
    const all = !only;
    if (all || only === 'general') {
      this.instanceName.set(s.instance_name);
      this.supportEmail.set(s.support_email || '');
    }
    if (all || only === 'announcement') {
      this.announcement.set(s.announcement || '');
      this.level.set(s.announcement_level || 'info');
    }
    if (all || only === 'signups') {
      this.signupsOpen.set(s.signups_open);
      this.orgCreationOpen.set(s.org_creation_open ?? true);
      this.domains.set(this.splitDomains(s.signup_domains));
    }
    if (all || only === 'plan') {
      const ld = { ...this.limitDraft() };
      for (const { key } of LIMITS) ld[key] = { value: s[key] === null ? '' : String(s[key]), unlimited: s[key] === null };
      this.limitDraft.set(ld);
    }
    const ovr = { ...this.ovr() };
    const sec = { ...this.secretDraft() };
    const editing = { ...this.secretEditing() };
    for (const [key, fields] of Object.entries(SECTION_OVERRIDES) as [SectionKey, OverrideField[]][]) {
      if (!all && key !== only) continue;
      for (const f of fields) ovr[f.name] = overrideToDraft(s.overrides[f.name]?.value, f.kind);
    }
    for (const [key, secrets] of Object.entries(SECTION_SECRETS) as [SectionKey, { name: string }[]][]) {
      if (!all && key !== only) continue;
      for (const sf of secrets) {
        sec[sf.name] = '';
        editing[sf.name] = false;
      }
    }
    if (all || only === 'ai') this.aiEnabled.set(overrideToDraft(s.overrides['AI_ENABLED']?.value, 'bool') as 'auto' | 'true' | 'false');
    this.ovr.set(ovr);
    this.secretDraft.set(sec);
    this.secretEditing.set(editing);
  }

  /* --- field helpers -------------------------------------------------------------- */

  protected setOvr(name: string, value: string) {
    this.ovr.update((o) => ({ ...o, [name]: value }));
    this.clearError(`overrides.${name}`);
  }

  protected source(name: string) {
    return this.data()?.overrides[name]?.source ?? 'environment';
  }

  protected effective(name: string): string {
    const v = this.data()?.overrides[name]?.effective;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return v ? 'On' : 'Off';
    return String(v);
  }

  protected secret(name: string) {
    return this.data()?.secrets[name] ?? { set: false, source: null };
  }

  protected setSecret(name: string, value: string) {
    this.secretDraft.update((o) => ({ ...o, [name]: value }));
    this.clearError(`secrets.${name}`);
  }

  protected editSecret(name: string, on: boolean) {
    this.secretEditing.update((o) => ({ ...o, [name]: on }));
    if (!on) this.setSecret(name, '');
  }

  protected limitValue(key: LimitKey): number | null {
    const d = this.limitDraft()[key];
    if (d.unlimited || d.value.trim() === '') return null;
    const n = Math.floor(Number(d.value));
    return Number.isFinite(n) ? n : null;
  }

  protected setLimit(key: LimitKey, patch: Partial<{ value: string; unlimited: boolean }>) {
    this.limitDraft.update((ld) => ({ ...ld, [key]: { ...ld[key], ...patch } }));
    this.clearError(key);
  }

  protected err(key: string): string {
    return this.errors()[key] ?? '';
  }

  private clearError(key: string) {
    if (this.errors()[key]) this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  }

  /* --- domains chip input ------------------------------------------------------------- */

  protected onDomainKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      this.commitDomain();
    } else if (e.key === 'Backspace' && !this.domainInput() && this.domains().length) {
      this.domains.update((d) => d.slice(0, -1));
    }
  }

  protected commitDomain() {
    const raw = this.domainInput()
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/,/g, '');
    if (raw && !this.domains().includes(raw)) this.domains.update((d) => [...d, raw]);
    this.domainInput.set('');
  }

  protected removeDomain(d: string) {
    this.domains.update((list) => list.filter((x) => x !== d));
  }

  /* --- saving ----------------------------------------------------------------------- */

  protected save(section: SectionKey) {
    const d = this.data();
    if (!d) return;
    const patch: PlatformSettingsPatch = {};
    switch (section) {
      case 'general':
        if (!this.instanceName().trim()) {
          this.errors.update((e) => ({ ...e, instance_name: 'Required.' }));
          return;
        }
        patch.instance_name = this.instanceName().trim();
        patch.support_email = this.supportEmail().trim();
        break;
      case 'announcement':
        patch.announcement = this.announcement().trim();
        patch.announcement_level = this.level();
        break;
      case 'signups':
        this.commitDomain();
        patch.signups_open = this.signupsOpen();
        patch.org_creation_open = this.orgCreationOpen();
        patch.signup_domains = this.domains().join(', ');
        break;
      case 'plan':
        for (const { key } of LIMITS) {
          const ld = this.limitDraft()[key];
          if (!ld.unlimited && (ld.value.trim() === '' || !(Number(ld.value) >= 0))) {
            this.errors.update((e) => ({ ...e, [key]: 'Enter a whole number, or tick Unlimited.' }));
            return;
          }
          patch[key] = this.limitValue(key);
        }
        break;
      default: {
        if (section === 'ai' && this.aiProvider() === 'openai_compatible' && !this.ovr()['AI_BASE_URL']?.trim() && !this.effective('AI_BASE_URL')) {
          this.errors.update((e) => ({ ...e, 'overrides.AI_BASE_URL': 'Required for a custom OpenAI-compatible API.' }));
          return;
        }
        const overrides: Record<string, OverrideValue | ''> = {};
        for (const f of SECTION_OVERRIDES[section] ?? []) {
          const draft = this.ovr()[f.name];
          if (draft !== overrideToDraft(d.overrides[f.name]?.value, f.kind)) overrides[f.name] = draftToOverride(draft, f.kind);
        }
        if (section === 'ai' && this.aiEnabled() !== overrideToDraft(d.overrides['AI_ENABLED']?.value, 'bool')) {
          overrides['AI_ENABLED'] = draftToOverride(this.aiEnabled(), 'bool');
        }
        const secrets: Record<string, string> = {};
        for (const s of SECTION_SECRETS[section] ?? []) {
          const v = this.secretDraft()[s.name]?.trim();
          if (v) secrets[s.name] = v;
        }
        if (Object.keys(overrides).length) patch.overrides = overrides;
        if (Object.keys(secrets).length) patch.secrets = secrets;
      }
    }
    this.send(section, patch, 'Settings saved');
  }

  protected discard(section: SectionKey) {
    const d = this.data();
    if (d) this.hydrate(d, section);
    this.errors.set({});
  }

  private send(section: SectionKey, patch: PlatformSettingsPatch, success: string, after?: () => void) {
    this.saving.set(section);
    this.info.saveSettings(patch).subscribe({
      next: (s) => {
        this.saving.set(null);
        this.hydrate(s, section);
        this.toast.success(success);
        after?.();
      },
      error: (err) => {
        this.saving.set(null);
        if (err instanceof HttpErrorResponse && err.status === 400 && err.error && typeof err.error === 'object' && !Array.isArray(err.error)) {
          const map: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.error as Record<string, unknown>)) map[k] = Array.isArray(v) ? v.join(' ') : String(v);
          this.errors.update((e) => ({ ...e, ...map }));
          this.toast.error('Not saved', 'Check the highlighted fields.');
        } else {
          this.toast.error('Not saved', err);
        }
      },
    });
  }

  protected resetOverride(section: SectionKey, f: { name: string; label: string }) {
    this.send(section, { overrides: { [f.name]: '' } }, `${f.label} reset to the environment value`);
  }

  protected async clearSecret(section: SectionKey, s: { name: string; label: string }) {
    const ok = await this.confirm.ask({
      title: `Clear ${s.label}?`,
      message: 'The value stored in the database is deleted. If the environment defines one, it takes over; otherwise the integration stops working.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (ok) this.send(section, { secrets: { [s.name]: '' } }, `${s.label} cleared`);
  }

  protected clearAnnouncement() {
    this.announcement.set('');
    this.send('announcement', { announcement: '' }, 'Announcement removed');
  }

  protected async togglePause(next: boolean, input: HTMLInputElement) {
    input.checked = !next; // keep the switch as it was until confirmed
    const ok = next
      ? await this.confirm.ask({
          title: 'Pause all publishing?',
          message:
            'This is an emergency stop for the whole platform: no organization publishes anything until you resume. Scheduled posts pile up as overdue and go out when publishing resumes.',
          confirmLabel: 'Pause publishing',
          danger: true,
          typeToConfirm: 'PAUSE',
        })
      : await this.confirm.ask({
          title: 'Resume publishing?',
          message: 'Overdue publications will be sent right away, then everything continues on schedule.',
          confirmLabel: 'Resume publishing',
        });
    if (!ok) return;
    this.pausing.set(true);
    this.info.saveSettings({ publishing_paused: next }).subscribe({
      next: (s) => {
        this.pausing.set(false);
        this.data.set(s);
        if (next) this.toast.warning('Publishing paused', 'Nothing will be published until you resume.');
        else this.toast.success('Publishing resumed');
      },
      error: (err) => {
        this.pausing.set(false);
        this.toast.error('Could not change publishing', err);
      },
    });
  }

  protected useModel(id: string) {
    this.setOvr('AI_MODEL', id);
    this.toast.info('Model selected', `${id} — save the AI section to use it.`);
  }

  protected testAi() {
    this.testing.set(true);
    this.testResult.set(null);
    this.info.testAi().subscribe({
      next: (r) => {
        this.testing.set(false);
        this.testResult.set(r);
      },
      error: (err) => {
        this.testing.set(false);
        this.testResult.set({ ok: false, detail: formatError(err) });
      },
    });
  }

  protected scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `${location.pathname}#${id}`);
  }

  protected callbackUrl(key: string) {
    return this.data()?.callback_urls?.[key] ?? `${this.origin}/api/oauth/${key}/callback`;
  }

  protected async copy(text: string) {
    if (await copyText(text)) this.toast.success('Copied to clipboard');
    else this.toast.error('Could not copy', 'Select the text and copy it manually.');
  }

  protected secretStatus(name: string): string {
    const s = this.secret(name);
    if (!s.set) return 'Not set';
    return s.source === 'database' ? 'Set (database)' : 'Set (environment)';
  }
}
