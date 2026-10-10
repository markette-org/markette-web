import { isNative } from '../../core/native/platform';
import { ServerConfigService } from '../../core/server-config.service';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fieldErrors } from '../../core/errors';
import { ApiToken, ApiTokenCreated } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { TokensService } from '../../core/tokens.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';

type Client = 'claude-code' | 'json' | 'cursor' | 'stdio';

const TOOLS: { name: string; text: string; kind?: 'writes' | 'publishes' }[] = [
  { name: 'list_workspaces', text: 'Workspaces you can access' },
  { name: 'list_channels', text: 'Connected channels in a workspace' },
  { name: 'list_posts', text: 'Posts, with filters' },
  { name: 'get_post', text: 'One post with per-channel status' },
  { name: 'create_post', text: 'Draft a post for chosen channels', kind: 'writes' },
  { name: 'validate_post', text: "Check content against each network's rules" },
  { name: 'schedule_post', text: 'Publish now, at a time, via the queue or at the best time; goes to review when approval is required', kind: 'publishes' },
  { name: 'unschedule_post', text: 'Move a scheduled post back to draft', kind: 'writes' },
  { name: 'review_post', text: 'Approve or request changes (reviewers only)', kind: 'publishes' },
  { name: 'get_calendar', text: "What's scheduled or published in a date range" },
  { name: 'get_best_times', text: 'Per-channel best-time heatmap data' },
  { name: 'suggest_times', text: 'Suggested publishing times with rationale' },
  { name: 'get_analytics', text: 'Overview metrics for a period' },
];

const PLACEHOLDER = '<your token>';

export function mcpSnippets(origin: string, token: string): Record<Client, string> {
  const json = JSON.stringify(
    { mcpServers: { markette: { type: 'http', url: `${origin}/mcp`, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
  return {
    'claude-code': `claude mcp add --transport http markette ${origin}/mcp --header "Authorization: Bearer ${token}"`,
    json,
    cursor: json,
    stdio: `MARKETTE_TOKEN=${token} MARKETTE_API_URL=${origin} python -m mcp_server`,
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copyable snippets for each MCP client, for a given token (or a placeholder). */
@Component({
  selector: 'app-mcp-snippets',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" aria-label="AI assistant">
      @for (c of clients; track c.id) {
        <button type="button" role="tab" [attr.aria-selected]="client() === c.id" (click)="client.set(c.id)">{{ c.label }}</button>
      }
    </div>
    <div class="snippet-body" role="tabpanel">
      <p class="muted small">
        @switch (client()) {
          @case ('claude-code') {
            Run this in a terminal; Claude Code connects over Streamable HTTP.
          }
          @case ('json') {
            Add this to the client's MCP configuration (for Claude Desktop: Settings → Developer → Edit config), then restart the client.
          }
          @case ('cursor') {
            Save as <code>.cursor/mcp.json</code> in a project, or <code>~/.cursor/mcp.json</code> for all projects.
          }
          @case ('stdio') {
            For clients that only support local (stdio) servers. Run from the backend folder, with its Python environment.
          }
        }
      </p>
      <div class="snippet">
        <pre class="mono">{{ snippets()[client()] }}</pre>
        <button type="button" class="btn sm copy" (click)="copy()"><app-icon name="copy" [size]="14" /> Copy</button>
      </div>
      @if (token() === placeholder) {
        <p class="hint muted tiny">Replace <code>{{ placeholder }}</code> with a token you created above.</p>
      }
    </div>
  `,
  styles: `
    .tabs {
      margin-bottom: 12px;
    }
    .snippet-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .snippet {
      position: relative;
    }
    pre {
      margin: 0;
      padding: 14px 16px;
      padding-right: 90px;
      border-radius: 12px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.55;
      white-space: pre;
    }
    .copy {
      position: absolute;
      top: 8px;
      right: 8px;
    }
  `,
})
export class McpSnippetsComponent {
  private readonly serverOrigin = inject(ServerConfigService).publicOrigin();
  readonly token = input(PLACEHOLDER);
  private readonly toast = inject(ToastService);

  protected readonly placeholder = PLACEHOLDER;
  protected readonly clients: { id: Client; label: string }[] = [
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'json', label: 'Claude Desktop & JSON clients' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'stdio', label: 'Local stdio' },
  ];
  protected readonly client = signal<Client>('claude-code');
  protected readonly snippets = computed(() => mcpSnippets(this.serverOrigin, this.token()));

  protected async copy() {
    if (await copyText(this.snippets()[this.client()])) this.toast.success('Copied to clipboard');
    else this.toast.error('Could not copy', 'Select the text and copy it manually.');
  }
}

@Component({
  selector: 'app-api-mcp-section',
  imports: [FormsModule, IconComponent, ModalComponent, EmptyStateComponent, TzDatePipe, RelativeTimePipe, McpSnippetsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" style="gap: 20px">
      <!-- Mobile app -->
      @if (!isNativeApp) {
        <section class="card mobile-app" id="mobile-app" aria-labelledby="mob-h">
          <div class="card-head">
            <h2 id="mob-h" class="row"><app-icon name="upload" [size]="18" /> Mobile app</h2>
          </div>
          <p class="muted small">Install Markette on your phone to share links and photos straight into a draft: use “Share” in any app and pick Markette.</p>
          <div class="mob-grid">
            <div class="mob">
              <strong>Android</strong>
              <a class="btn primary sm" [href]="serverOrigin + '/downloads/markette.apk'" download><app-icon name="upload" [size]="14" /> Download the APK</a>
              <span class="hint">Open the file on your phone. Android asks you to allow installing apps from this source (your browser or file manager) — allow it once, then install. On first launch, enter this server: <span class="mono">{{ serverOrigin }}</span></span>
            </div>
            <div class="mob">
              <strong>iOS</strong>
              <span class="hint">Built from source with Xcode; see the mobile docs in the repository. There is no App Store download.</span>
            </div>
          </div>
          <p class="hint muted tiny">Signing in with single sign-on? In the app choose “Sign in with an API token” and create a token below.</p>
        </section>
      }

      <!-- Tokens -->
      <section class="card flush" aria-labelledby="tok-h">
        <div class="card-head pad">
          <div>
            <h2 id="tok-h">Personal API tokens</h2>
            <p class="muted small intro">
              A token authenticates as <strong>you</strong> with <code>Authorization: Bearer mkt_…</code> on the whole REST API and the MCP server.
              It has the same permissions as your account in every workspace. Keep it secret and revoke it here when you no longer need it.
            </p>
          </div>
          <button type="button" class="btn primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> New token</button>
        </div>

        @if (loading()) {
          <div class="pad-b"><div class="skeleton" style="height: 80px"></div></div>
        } @else if (loadError()) {
          <div class="pad-b"><div class="form-error" role="alert">{{ loadError() }}</div></div>
        } @else if (!tokens().length) {
          <app-empty-state icon="lock" title="No tokens yet" text="Create a token to connect an AI assistant over MCP, or to call the API from your own scripts." />
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (t of tokens(); track t.id) {
                  <tr>
                    <td class="strong">{{ t.name }}</td>
                    <td><code class="mono" title="First characters of the token">{{ t.hint }}…</code></td>
                    <td class="small">{{ t.created_at | tzDate: 'date' }}</td>
                    <td class="small">
                      @if (t.last_used_at) {
                        <span [attr.title]="t.last_used_at | tzDate">{{ t.last_used_at | relTime }}</span>
                      } @else {
                        <span class="muted">Never</span>
                      }
                    </td>
                    <td class="small">
                      @if (!t.expires_at) {
                        <span class="muted">Never</span>
                      } @else if (isExpired(t)) {
                        <span class="chip danger">Expired</span>
                      } @else {
                        {{ t.expires_at | tzDate: 'date' }}
                      }
                    </td>
                    <td class="num">
                      <button type="button" class="btn danger-ghost sm" (click)="revoke(t)" [disabled]="revoking() === t.id">
                        @if (revoking() === t.id) {
                          <span class="spinner"></span>
                        } @else {
                          <app-icon name="trash" [size]="14" />
                        }
                        Revoke
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- Connect -->
      <section class="card" aria-labelledby="rest-h">
        <div class="card-head">
          <div>
            <h2 id="rest-h">REST API</h2>
            <p class="muted small intro">
              Everything Markette does is available over HTTP: posts, scheduling, approvals, channels, calendar, analytics and AI
              helpers. Authenticate with a token from above and pick the workspace with the <code>X-Workspace</code> header.
            </p>
          </div>
        </div>
        <div class="docs-links">
          <a class="doc-link" [href]="apiBase + '/docs/'" target="_blank" rel="noopener">
            <app-icon name="external" [size]="16" />
            <span><strong>Interactive reference</strong><span class="muted small sub">Swagger UI, try requests with your token</span></span>
          </a>
          <a class="doc-link" [href]="apiBase + '/redoc/'" target="_blank" rel="noopener">
            <app-icon name="external" [size]="16" />
            <span><strong>Readable reference</strong><span class="muted small sub">ReDoc, with the getting-started guide</span></span>
          </a>
          <a class="doc-link" [href]="apiBase + '/schema/?format=json'" target="_blank" rel="noopener">
            <app-icon name="external" [size]="16" />
            <span><strong>OpenAPI 3 schema</strong><span class="muted small sub">For code generators and API clients</span></span>
          </a>
        </div>
        <div class="field endpoint">
          <span class="label">Base URL</span>
          <div class="row">
            <code class="endpoint-url truncate">{{ apiBase }}</code>
            <button type="button" class="btn sm" (click)="copy(apiBase)"><app-icon name="copy" [size]="14" /> Copy</button>
          </div>
        </div>
        <div class="field">
          <span class="label">Quick start (this workspace: <code>{{ wsSlug() }}</code>)</span>
          <div class="snippet-wrap">
            <pre class="snippet"><code>{{ curlSnippet() }}</code></pre>
            <button type="button" class="btn sm copy" (click)="copy(curlSnippet())"><app-icon name="copy" [size]="14" /> Copy</button>
          </div>
          <span class="hint">Replace <code>mkt_…</code> with a token. Lists are paginated with <code>?limit=</code>/<code>?offset=</code>; times are ISO 8601.</span>
        </div>
      </section>

      <section class="card" aria-labelledby="mcp-h">
        <div class="card-head">
          <div>
            <h2 id="mcp-h">Connect an AI assistant</h2>
            <p class="muted small intro">
              The MCP server lets assistants draft, validate, schedule and review posts, and read calendars, best times and analytics, acting as you.
            </p>
          </div>
        </div>
        <div class="field endpoint">
          <span class="label">MCP endpoint (Streamable HTTP)</span>
          <div class="row">
            <code class="endpoint-url truncate">{{ endpoint }}</code>
            <button type="button" class="btn sm" (click)="copy(endpoint)"><app-icon name="copy" [size]="14" /> Copy</button>
          </div>
        </div>
        <app-mcp-snippets />
      </section>

      <!-- Tools -->
      <section class="card" aria-labelledby="tools-h">
        <div class="card-head"><h2 id="tools-h">Available tools</h2></div>
        <ul class="list-reset tools">
          @for (tool of tools; track tool.name) {
            <li>
              <code class="mono tool-name">{{ tool.name }}</code>
              <span class="small">
                {{ tool.text }}
                @if (tool.kind) {
                  <span class="chip" [class.warning]="tool.kind === 'writes'" [class.danger]="tool.kind === 'publishes'">{{ tool.kind }}</span>
                }
              </span>
            </li>
          }
        </ul>
        <div class="notice warning" style="margin-top: 16px">
          <app-icon name="lock" [size]="16" />
          <span>
            A token is as powerful as your account: whoever holds it can do everything you can, including publishing.
            Give each assistant its own token, prefer an expiry, and revoke tokens you no longer use.
          </span>
        </div>
      </section>
    </div>

    <!-- Create -->
    <app-modal [open]="createOpen()" title="New API token" subtitle="Name it after where you will use it." size="sm" (closed)="createOpen.set(false)" [dismissible]="!creating()">
      <form id="tok-form" class="stack" (ngSubmit)="create()" novalidate>
        <div class="field">
          <label for="tok-name">Name</label>
          <input id="tok-name" name="name" class="input" [class.invalid]="nameError()" [ngModel]="name()" (ngModelChange)="name.set($event)" placeholder="Claude Desktop" maxlength="80" />
          @if (nameError()) {
            <span class="error">{{ nameError() }}</span>
          }
        </div>
        <div class="field">
          <label for="tok-exp">Expires</label>
          <select id="tok-exp" name="exp" class="select" [ngModel]="expiry()" (ngModelChange)="expiry.set($event)">
            <option [ngValue]="null">Never</option>
            <option [ngValue]="30">In 30 days</option>
            <option [ngValue]="90">In 90 days</option>
            <option [ngValue]="365">In 365 days</option>
          </select>
        </div>
        @if (createError()) {
          <div class="form-error" role="alert">{{ createError() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="createOpen.set(false)" [disabled]="creating()">Cancel</button>
        <button type="submit" form="tok-form" class="btn primary" [disabled]="creating()">
          @if (creating()) {
            <span class="spinner"></span>
          }
          Create token
        </button>
      </div>
    </app-modal>

    <!-- One-time reveal -->
    <app-modal [open]="!!revealed()" title="Copy your new token" [subtitle]="revealed()?.name ?? ''" size="lg" [dismissible]="false" (closed)="doneReveal()">
      @if (revealed(); as r) {
        <div class="stack">
          <div class="notice warning" role="alert">
            <app-icon name="alert" [size]="16" />
            <span>This is the only time the token is shown. Store it somewhere safe; if you lose it, revoke it and create a new one.</span>
          </div>
          <div class="reveal">
            <code class="mono reveal-token">{{ r.token }}</code>
            <button type="button" class="btn primary sm" (click)="copy(r.token)"><app-icon name="copy" [size]="14" /> Copy</button>
          </div>
          <details class="connect-details">
            <summary>Connect an assistant with this token</summary>
            <div style="margin-top: 12px"><app-mcp-snippets [token]="r.token" /></div>
          </details>
        </div>
      }
      <div modal-footer>
        <button type="button" class="btn primary" (click)="doneReveal()">I've copied it</button>
      </div>
    </app-modal>
  `,
  styles: `
    .mob-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 12px;
    }
    @media (max-width: 640px) {
      .mob-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .mob {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface-2);
    }
    .mobile-app {
      scroll-margin-top: calc(var(--topbar-h) + 16px);
    }
    .docs-links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin: 4px 0 16px;
    }
    .doc-link {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .doc-link:hover { border-color: var(--accent); background: var(--accent-soft, transparent); }
    .doc-link app-icon { color: var(--accent); margin-top: 2px; }
    .doc-link .sub { display: block; margin-top: 2px; }
    .snippet-wrap { position: relative; }
    .snippet {
      margin: 0;
      padding: 14px 16px;
      padding-right: 90px;
      border-radius: 10px;
      background: var(--code-bg, var(--surface-2));
      font-size: 12.5px;
      line-height: 1.55;
      overflow-x: auto;
      white-space: pre;
    }
    .snippet-wrap .copy { position: absolute; top: 8px; right: 8px; }

    .pad {
      padding: 20px 20px 0;
    }
    .pad-b {
      padding: 0 20px 20px;
    }
    .card.flush .card-head {
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .intro {
      margin-top: 4px;
      max-width: 640px;
    }
    .endpoint {
      margin-bottom: 16px;
    }
    .endpoint-url {
      flex: 1;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
      font-size: 0.85rem;
    }
    .tools {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 24px;
    }
    .tools li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tool-name {
      font-weight: 600;
      color: var(--accent-ink);
    }
    .tools .chip {
      height: 18px;
      font-size: 0.65rem;
      margin-left: 4px;
    }
    @media (max-width: 720px) {
      .tools {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .reveal {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
    }
    .reveal-token {
      flex: 1;
      word-break: break-all;
      font-size: 0.85rem;
      user-select: all;
    }
    .connect-details summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
    }
  `,
})
export class ApiMcpSectionComponent implements OnInit {
  protected readonly isNativeApp = isNative();
  protected readonly serverOrigin = inject(ServerConfigService).publicOrigin();
  private readonly tokensApi = inject(TokensService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private readonly ws = inject(WorkspaceService);

  protected readonly tools = TOOLS;
  private readonly serverCfg = inject(ServerConfigService);
  protected readonly endpoint = `${this.serverCfg.publicOrigin()}/mcp`;
  protected readonly apiBase = `${this.serverCfg.publicOrigin()}/api`;
  protected readonly wsSlug = computed(() => this.ws.slug() ?? 'your-workspace');
  protected readonly curlSnippet = computed(() => {
    const ws = this.wsSlug();
    const api = this.apiBase;
    return [
      'TOKEN=mkt_…',
      '',
      '# Channels you can publish to',
      `curl -H "Authorization: Bearer $TOKEN" -H "X-Workspace: ${ws}" ${api}/channels/`,
      '',
      '# Create a draft for channel 12, then schedule it at the best time',
      `curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Workspace: ${ws}" -H "Content-Type: application/json" \\`,
      `  -d '{"body": "Hello from the API", "targets": [{"channel": 12}]}' ${api}/posts/`,
      `curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Workspace: ${ws}" -H "Content-Type: application/json" \\`,
      `  -d '{"mode": "best_time"}' ${api}/posts/<id>/schedule/`,
    ].join('\n');
  });

  protected readonly tokens = signal<ApiToken[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly revoking = signal<number | null>(null);

  protected readonly createOpen = signal(false);
  protected readonly name = signal('');
  protected readonly expiry = signal<number | null>(90);
  protected readonly creating = signal(false);
  protected readonly nameError = signal('');
  protected readonly createError = signal('');
  protected readonly revealed = signal<ApiTokenCreated | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.tokensApi.list().subscribe({
      next: (list) => {
        this.tokens.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(fieldErrors(err).general || 'Could not load tokens.');
      },
    });
  }

  protected isExpired(t: ApiToken): boolean {
    return !!t.expires_at && new Date(t.expires_at).getTime() < Date.now();
  }

  protected openCreate() {
    this.name.set('');
    this.expiry.set(90);
    this.nameError.set('');
    this.createError.set('');
    this.createOpen.set(true);
  }

  protected create() {
    const name = this.name().trim();
    if (!name) {
      this.nameError.set('Give the token a name, e.g. "Claude Desktop".');
      return;
    }
    this.creating.set(true);
    this.nameError.set('');
    this.createError.set('');
    this.tokensApi.create(name, this.expiry()).subscribe({
      next: (t) => {
        this.creating.set(false);
        this.createOpen.set(false);
        const { token: _secret, ...row } = t;
        this.tokens.update((list) => [row, ...list]);
        this.revealed.set(t);
      },
      error: (err) => {
        this.creating.set(false);
        const { fields, general } = fieldErrors(err);
        this.nameError.set(fields['name'] ?? '');
        this.createError.set([general, fields['expires_in_days']].filter(Boolean).join('\n'));
      },
    });
  }

  protected doneReveal() {
    this.revealed.set(null);
  }

  protected async revoke(t: ApiToken) {
    const ok = await this.confirm.ask({
      title: `Revoke "${t.name}"?`,
      message: 'Apps and assistants using this token stop working immediately. This cannot be undone.',
      confirmLabel: 'Revoke token',
      danger: true,
    });
    if (!ok) return;
    this.revoking.set(t.id);
    this.tokensApi.revoke(t.id).subscribe({
      next: () => {
        this.revoking.set(null);
        this.tokens.update((list) => list.filter((x) => x.id !== t.id));
        this.toast.success('Token revoked');
      },
      error: (err) => {
        this.revoking.set(null);
        this.toast.error('Could not revoke the token', err);
      },
    });
  }

  protected async copy(text: string) {
    if (await copyText(text)) this.toast.success('Copied to clipboard');
    else this.toast.error('Could not copy', 'Select the text and copy it manually.');
  }
}
