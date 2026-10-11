import { ServerConfigService } from '../../core/server-config.service';
import { ExternalService } from '../../core/native/external.service';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Channel, ConnectStartResponse, CredentialField, Provider } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { PROVIDER_ORDER } from '../../shared/utils/providers';

type CredValue = string | boolean;

@Component({
  selector: 'app-connect-dialog',
  imports: [ModalComponent, ProviderIconComponent, IconComponent, FormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="open()"
      [title]="selected() ? 'Connect ' + selected()!.label : 'Connect a channel'"
      [subtitle]="selected() ? subtitleFor(selected()!) : 'Pick a network or site. You can connect as many accounts as you like.'"
      size="lg"
      [dismissible]="!busy()"
      (closed)="close()"
    >
      @if (!selected()) {
        @if (loading()) {
          <div class="grid grid-3">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <div class="skeleton" style="height: 72px"></div>
            }
          </div>
        } @else if (loadError()) {
          <div class="form-error" role="alert">{{ loadError() }}</div>
        } @else {
          @for (group of groups(); track group.title) {
            @if (group.items.length) {
              <h3 class="group-title">{{ group.title }}</h3>
              <div class="prov-grid">
                @for (p of group.items; track p.key) {
                  <button type="button" class="prov" [disabled]="!p.configured" (click)="choose(p)">
                    <app-provider-icon [provider]="p.key" [size]="36" />
                    <span class="prov-text">
                      <span class="strong">{{ p.label }}</span>
                      <span class="muted tiny">
                        @if (p.configured) {
                          {{ capLine(p) }}
                        } @else {
                          Server admin must add API credentials
                        }
                      </span>
                    </span>
                    @if (p.configured) {
                      <app-icon name="chevronRight" [size]="16" />
                    } @else {
                      <app-icon name="lock" [size]="16" />
                    }
                  </button>
                }
              </div>
            }
          }
        }
      } @else {
        @let p = selected()!;
        <form id="connect-form" class="stack" (ngSubmit)="submit()" novalidate>
          @if (p.auth === 'oauth2') {
            @if (p.instance_url) {
              <div class="field">
                <label for="cx-server">Server</label>
                <input id="cx-server" name="server" class="input" [(ngModel)]="server" placeholder="mastodon.social" autocomplete="off" required />
                <span class="hint">The instance your account lives on, e.g. mastodon.social or fosstodon.org.</span>
              </div>
            }
            <div class="notice accent">
              <app-icon name="lock" [size]="16" />
              <span>You'll be sent to {{ p.label }} to approve access, then brought back here. If several accounts or pages are available you can choose which to add.</span>
            </div>
          } @else {
            @switch (p.key) {
              @case ('wechat') {
                <div class="notice warning small">
                  <app-icon name="alert" [size]="16" />
                  <span>Requires a <strong>verified Official Account</strong> and this server's IP in <strong>设置与开发 → 基本配置 → IP白名单</strong> (IP whitelist). Ask your server administrator for the outgoing IP address.</span>
                </div>
              }
              @case ('whatsapp') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    WhatsApp has no API for Channels: Markette sends your approved <strong>marketing template</strong> to people who opted in (they send JOIN to your number).
                    After connecting, set up the webhook and manage subscribers from the channel card. Meta bills each delivered marketing message.
                  </span>
                </div>
              }
              @case ('discord') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    In Discord open <strong>Channel settings → Integrations → Webhooks → New Webhook</strong> and copy its URL.
                    Mentions such as @everyone are disabled; long text is split into several messages.
                  </span>
                </div>
              }
              @case ('slack') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    Create an app at <strong>api.slack.com/apps</strong>, add the bot scopes listed below under <strong>OAuth &amp; Permissions</strong>,
                    install it to your workspace and paste the <strong>Bot User OAuth Token</strong>. It can post in every public channel;
                    for a private channel, add the app to it first.
                  </span>
                </div>
              }
              @case ('devto') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    In dev.to open <strong>Settings → Extensions → DEV Community API Keys</strong> and generate a key. Articles use the post title,
                    up to four tags and the first image as cover. Images are linked from this server, so they must be publicly reachable.
                  </span>
                </div>
              }
              @case ('ghost') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    Create a <strong>custom integration</strong> in Ghost Admin → Settings → Integrations and paste its Admin API key.
                    Add a newsletter slug to also email each post to members (leave empty for web only).
                  </span>
                </div>
              }
              @case ('brevo') {
                <ng-container [ngTemplateOutlet]="newsletterNote" />
              }
              @case ('listmonk') {
                <ng-container [ngTemplateOutlet]="newsletterNote" />
              }
              @case ('webhook') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <span>
                    Markette POSTs each publication as signed JSON to your endpoint (e.g. an n8n Webhook node). On connect it sends a signed
                    <code>ping</code>: the endpoint must answer with a 2xx status. Extra headers go one per line as <code>Key: value</code>.
                  </span>
                </div>
              }
              @case ('qq') {
                <div class="notice accent small">
                  <app-icon name="info" [size]="16" />
                  <div>
                    The bot posts to QQ Guild channels and to groups it already knows. Before connecting:
                    <ol class="steps">
                      <li>Set the bot's callback URL in the QQ Open Platform (shown after the first attempt).</li>
                      <li>Add the bot to a group and @-mention it once.</li>
                      <li>The group owner must enable 「机器人主动在群聊内发言」.</li>
                      <li>Then press Connect (again).</li>
                    </ol>
                  </div>
                </div>
              }
            }
            @for (f of p.credential_fields; track f.name) {
              @switch (f.type) {
                @case ('checkbox') {
                  <label class="checkbox">
                    <input type="checkbox" [name]="f.name" [ngModel]="!!values()[f.name]" (ngModelChange)="set(f.name, $event)" />
                    {{ f.label }}
                  </label>
                  @if (f.help) {
                    <span class="hint muted tiny">{{ f.help }}</span>
                  }
                }
                @default {
                  <div class="field">
                    <label [for]="'cx-' + f.name">{{ f.label }}@if (!f.required) {<span class="muted"> (optional)</span>}</label>
                    @if (f.type === 'textarea') {
                      <textarea
                        [id]="'cx-' + f.name"
                        class="textarea mono-area"
                        [name]="f.name"
                        [ngModel]="str(f.name)"
                        (ngModelChange)="set(f.name, $event)"
                        rows="3"
                        spellcheck="false"
                        [placeholder]="p.key === 'webhook' && f.name === 'headers' ? 'Authorization: Bearer …' : ''"
                      ></textarea>
                    } @else if (f.type === 'select') {
                      <select [id]="'cx-' + f.name" class="select" [name]="f.name" [ngModel]="str(f.name)" (ngModelChange)="set(f.name, $event)">
                        @for (c of f.choices ?? []; track c) {
                          <option [value]="c">{{ choiceLabel(p.key, f.name, c) }}</option>
                        }
                      </select>
                    } @else {
                      <input
                        [id]="'cx-' + f.name"
                        class="input"
                        [type]="f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'"
                        [name]="f.name"
                        [ngModel]="str(f.name)"
                        (ngModelChange)="set(f.name, $event)"
                        [attr.autocomplete]="f.type === 'password' ? 'new-password' : 'off'"
                      />
                    }
                    @if (f.help) {
                      <span class="hint">{{ f.help }}</span>
                    }
                  </div>
                }
              }
            }
            <p class="muted tiny"><app-icon name="lock" [size]="12" /> Credentials are encrypted at rest and only used to publish on your behalf.</p>
          }
          @if (qqHelp(); as q) {
            <div class="qq-help" role="alert">
              <div class="row"><app-icon name="alert" [size]="16" /><strong class="small">The bot has no channels or groups yet</strong></div>
              <p class="small muted">{{ q.message }}</p>
              <span class="label small">Callback URL</span>
              <div class="row">
                <code class="mono-box truncate">{{ q.url }}</code>
                <button type="button" class="btn sm" (click)="copy(q.url)"><app-icon name="copy" [size]="14" /> Copy</button>
              </div>
              <ol class="steps small">
                <li>In the QQ Open Platform (q.qq.com → your bot → development settings), set this as the callback URL.</li>
                <li>Add the bot to a group and @-mention it once.</li>
                <li>The group owner must enable 「机器人主动在群聊内发言」.</li>
                <li>Press <strong>Connect</strong> again.</li>
              </ol>
            </div>
          } @else if (error()) {
            <div class="form-error" role="alert">{{ error() }}</div>
          }
        </form>
      }
      <div modal-footer>
        @if (selected() && !preset()) {
          <button type="button" class="btn ghost" (click)="back()" [disabled]="busy()"><app-icon name="arrowLeft" [size]="16" /> All networks</button>
          <span class="spacer"></span>
        }
        <button type="button" class="btn" (click)="close()" [disabled]="busy()">Cancel</button>
        @if (selected()) {
          <button type="submit" form="connect-form" class="btn primary" [disabled]="busy()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            {{ selected()!.auth === 'oauth2' ? 'Continue to ' + selected()!.label : 'Connect' }}
          </button>
        }
      </div>
    </app-modal>
    <ng-template #newsletterNote>
      <div class="notice accent small">
        <app-icon name="info" [size]="16" />
        <span>
          Each mailing list becomes its own channel. The post title is the <strong>email subject</strong>; the text is rendered as an email
          with a hero image, a "Read more" button for the post link and an unsubscribe link.
        </span>
      </div>
    </ng-template>
  `,
  styles: `
    .group-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 8px 0 10px;
    }
    .prov-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .prov {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    }
    .prov:hover:not(:disabled) {
      border-color: var(--accent);
      box-shadow: var(--shadow-sm);
    }
    .prov:disabled {
      cursor: not-allowed;
      opacity: 0.6;
      background: var(--surface-2);
    }
    .steps {
      margin: 6px 0 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mono-area {
      font-family: var(--font-mono);
      font-size: 0.82rem;
      min-height: 0;
    }
    .qq-help {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid var(--warning);
      background: var(--warning-soft);
    }
    .mono-box {
      flex: 1;
      padding: 6px 9px;
      border-radius: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 0.78rem;
    }
    .prov-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      line-height: 1.3;
    }
  `,
})
export class ConnectDialogComponent {
  private readonly external = inject(ExternalService);
  private readonly serverCfg = inject(ServerConfigService);

  /** Web: leave for the network's sign-in page. App: open it in the system browser and wait. */
  private openAuthorize(url: string) {
    if (this.external.native) {
      this.toast.info('Finish in the browser', 'Sign in with the network there, then come back to the app; your channels refresh automatically.');
      this.busy.set(false);
      this.close();
    }
    void this.external.go(url, 'oauth');
  }

  private api = inject(ApiService);
  private catalog = inject(CatalogService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly open = input(false);
  /** Provider key to jump straight into (e.g. "Reconnect"). */
  readonly preset = input<string | null>(null);
  readonly presetServer = input<string>('');
  readonly closed = output<void>();
  readonly connected = output<Channel[]>();

  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly selected = signal<Provider | null>(null);
  protected readonly values = signal<Record<string, CredValue>>({});
  protected readonly server = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** QQ: "no channels or groups yet" → callback URL + steps. */
  protected readonly qqHelp = signal<{ message: string; url: string } | null>(null);

  protected readonly groups = computed(() => {
    const order = (p: Provider) => {
      const i = PROVIDER_ORDER.indexOf(p.key);
      return i === -1 ? 99 : i;
    };
    const all = [...this.catalog.providers()].sort((a, b) => order(a) - order(b));
    return [
      { title: 'Social', items: all.filter((p) => p.key !== 'webhook' && p.kind !== 'blog' && p.kind !== 'newsletter') },
      { title: 'Blogs & sites', items: all.filter((p) => p.key !== 'webhook' && p.kind === 'blog') },
      { title: 'Newsletters', items: all.filter((p) => p.key !== 'webhook' && p.kind === 'newsletter') },
      { title: 'Integrations', items: all.filter((p) => p.key === 'webhook') },
    ].filter((g) => g.items.length);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const preset = this.preset();
      const server = this.presetServer();
      this.error.set('');
      this.busy.set(false);
      this.loading.set(true);
      this.loadError.set('');
      this.catalog.loadProviders().subscribe({
        next: (list) => {
          this.loading.set(false);
          const p = preset ? list.find((x) => x.key === preset) : null;
          if (p && p.configured) {
            this.choose(p);
            if (server) this.server.set(server.replace(/^https?:\/\//, '').replace(/\/+$/, ''));
          } else {
            this.selected.set(null);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.loadError.set(formatError(err));
        },
      });
    });
  }

  protected subtitleFor(p: Provider): string {
    return p.auth === 'oauth2' ? 'Sign in with the network to authorise Markette.' : 'Enter the details for your site or account.';
  }

  protected capLine(p: Provider): string {
    const parts: string[] = [];
    parts.push(p.max_chars ? `${p.max_chars.toLocaleString()} chars` : 'Long-form');
    if (p.requires_media) parts.push('image required');
    else if (p.max_media) parts.push(`up to ${p.max_media} media`);
    if (p.has_metrics) parts.push('metrics');
    return parts.join(' · ');
  }

  protected choiceLabel(provider: string, field: string, value: string): string {
    if (provider === 'wechat' && field === 'mode') {
      if (value === 'push') return 'Push to followers (mass send, verified accounts)';
      if (value === 'publish') return 'Publish link only (no push)';
    }
    return value;
  }

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  }

  protected choose(p: Provider) {
    this.selected.set(p);
    this.error.set('');
    this.qqHelp.set(null);
    this.server.set('');
    const init: Record<string, CredValue> = {};
    for (const f of p.credential_fields) init[f.name] = defaultValue(f);
    this.values.set(init);
  }

  protected back() {
    this.selected.set(null);
    this.error.set('');
    this.qqHelp.set(null);
  }

  protected str(name: string): string {
    const v = this.values()[name];
    return typeof v === 'string' ? v : '';
  }

  protected set(name: string, value: CredValue) {
    this.values.update((v) => ({ ...v, [name]: value }));
  }

  protected close() {
    if (this.busy()) return;
    this.selected.set(null);
    this.closed.emit();
  }

  protected submit() {
    const p = this.selected();
    if (!p || this.busy()) return;
    this.error.set('');
    this.qqHelp.set(null);
    if (p.auth === 'oauth2') {
      const body: Record<string, string> = { provider: p.key };
      if (p.instance_url) {
        const server = this.server().trim();
        if (!server) {
          this.error.set('Enter the server your account is on, e.g. mastodon.social.');
          return;
        }
        body['base_url'] = server;
      }
      this.busy.set(true);
      this.api.post<ConnectStartResponse>('channels/connect/', body).subscribe({
        next: (res) => {
          if (res.authorize_url) {
            this.openAuthorize(res.authorize_url);
          } else {
            this.busy.set(false);
            this.error.set('The server did not return an authorisation link.');
          }
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(formatError(err));
        },
      });
      return;
    }

    const creds: Record<string, CredValue> = {};
    const missing: string[] = [];
    for (const f of p.credential_fields) {
      const v = this.values()[f.name];
      const val = typeof v === 'string' ? v.trim() : v;
      if (f.required && f.type !== 'checkbox' && !val) missing.push(f.label);
      if (val !== '' && val !== undefined) creds[f.name] = val;
    }
    if (missing.length) {
      this.error.set(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    this.busy.set(true);
    this.api.post<ConnectStartResponse>('channels/connect/', { provider: p.key, credentials: creds }).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.channels?.length) {
          res.channels.forEach((c) => this.catalog.upsertChannel(c));
          this.toast.success(
            res.channels.length === 1 ? `${res.channels[0].name} connected` : `${res.channels.length} channels connected`,
          );
          this.selected.set(null);
          this.connected.emit(res.channels);
        } else if (res.request_id) {
          this.selected.set(null);
          this.closed.emit();
          this.router.navigate(['/channels/connect', res.request_id]);
        } else {
          this.error.set('Nothing was connected. Check the details and try again.');
        }
      },
      error: (err) => {
        this.busy.set(false);
        const message = formatError(err);
        if (p.key === 'qq' && /no guild channels|callback URL/i.test(message)) {
          const m = /https?:\/\/\S+\/api\/channels\/qq\/webhook\/\S+?\/?(?=\s|,|$)/.exec(message);
          const appId = String(this.values()['app_id'] ?? '').trim();
          const url = m ? m[0].replace(/[.,;:)]+$/, '') : `${this.serverCfg.publicOrigin()}/api/channels/qq/webhook/${appId}/`;
          this.qqHelp.set({ message, url });
          return;
        }
        this.error.set(message);
      },
    });
  }
}

function defaultValue(f: CredentialField): CredValue {
  if (f.type === 'checkbox') return f.default === true || f.default === 'true';
  if (f.default !== null && f.default !== undefined) return String(f.default);
  if (f.type === 'select' && f.choices?.length) return f.choices[0];
  return '';
}
