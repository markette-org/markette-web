import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Channel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { channelColor, providerMeta } from '../../shared/utils/providers';
import { ConnectDialogComponent } from './connect-dialog.component';
import { SubscribersDrawerComponent } from './subscribers-drawer.component';
import { WebhookSetupComponent } from './webhook-setup.component';
import { AddSubredditDialogComponent } from './add-subreddit-dialog.component';

const SOON_MS = 7 * 86_400_000;

const YOUTUBE_CATEGORIES: Record<string, string> = {
  '1': 'Film & Animation',
  '10': 'Music',
  '17': 'Sports',
  '22': 'People & Blogs',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
};

@Component({
  selector: 'app-channels-page',
  imports: [
    AddSubredditDialogComponent,
    FormsModule,
    RouterLink,
    AvatarComponent,
    IconComponent,
    StatusChipComponent,
    EmptyStateComponent,
    ConnectDialogComponent,
    SubscribersDrawerComponent,
    NumPipe,
    TzDatePipe,
    RelativeTimePipe,
    WebhookSetupComponent,
    NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">Publishing destinations</div>
          <h1>Channels</h1>
          <p class="subtitle">Social accounts, pages and sites you can publish to.</p>
        </div>
        <div class="actions">
          @if (catalog.teams().length) {
            <label for="team-filter" class="sr-only">Filter by team</label>
            <select id="team-filter" class="select sm" style="width: auto; min-width: 170px" [ngModel]="teamFilter()" (ngModelChange)="teamFilter.set($event)">
              <option [ngValue]="null">All teams</option>
              <option [ngValue]="0">Not assigned to a team</option>
              @for (t of catalog.teams(); track t.id) {
                <option [ngValue]="t.id">{{ t.name }}</option>
              }
            </select>
          }
          @if (ws.isAdmin()) {
            <button type="button" class="btn primary" (click)="openConnect()"><app-icon name="plus" [size]="16" /> Connect channel</button>
          }
        </div>
      </header>

      @if (reauth().length) {
        <div class="notice warning" style="margin-bottom: 20px" role="status">
          <app-icon name="alert" [size]="18" />
          <span>
            <strong>{{ reauth().length }} {{ reauth().length === 1 ? 'channel needs' : 'channels need' }} reconnecting.</strong>
            Scheduled posts to {{ reauth().length === 1 ? 'it' : 'them' }} will fail until access is restored.
          </span>
        </div>
      }

      @if (loading() && !catalog.channels().length) {
        <div class="grid grid-auto">
          @for (i of [1, 2, 3]; track i) {
            <div class="card"><div class="skeleton" style="height: 150px"></div></div>
          }
        </div>
      } @else if (loadError()) {
        <div class="card">
          <div class="form-error" role="alert">{{ loadError() }}</div>
          <button type="button" class="btn" style="margin-top: 12px" (click)="reload()"><app-icon name="refresh" [size]="16" /> Try again</button>
        </div>
      } @else if (!catalog.channels().length) {
        <div class="card">
          <app-empty-state
            icon="channels"
            title="Connect your first channel"
            text="Add an X, Bluesky, Mastodon, LinkedIn, Facebook or Instagram account, or a WordPress, Drupal or Hugo site. Then compose once and publish everywhere."
          >
            @if (ws.isAdmin()) {
              <button type="button" class="btn primary" (click)="openConnect()"><app-icon name="plus" [size]="16" /> Connect a channel</button>
            } @else {
              <span class="muted small">Ask a workspace admin to connect channels.</span>
            }
          </app-empty-state>
        </div>
      } @else {
        @if (!sortedRelevant().length && !sortedOther().length) {
          <div class="card">
            <p class="muted">No channels match this team filter.</p>
          </div>
        } @else {
          <section class="ch-section" aria-labelledby="rel-h">
            <div class="section-title">
              <h2 id="rel-h"><app-icon name="target" [size]="18" /> Relevant to {{ ws.active()?.name || 'this workspace' }}</h2>
              <span class="muted small">{{ sortedRelevant().length }}</span>
            </div>
            @if (sortedRelevant().length) {
              <div class="grid grid-auto">
                @for (ch of sortedRelevant(); track ch.id) {
                  <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: ch }" />
                }
              </div>
            } @else {
              <p class="muted small empty-rel">
                No channel is marked relevant for this workspace yet.
                @if (ws.isAdmin()) {
                  Star the ones this workspace publishes to; they are listed first everywhere.
                }
              </p>
            }
          </section>

          @if (sortedOther().length) {
            <section class="ch-section other" aria-labelledby="oth-h">
              <button type="button" class="section-toggle" (click)="otherOpen.set(!otherIsOpen())" [attr.aria-expanded]="otherIsOpen()">
                <app-icon [name]="otherIsOpen() ? 'chevronDown' : 'chevronRight'" [size]="16" />
                <h2 id="oth-h">Other channels in {{ orgName() }}</h2>
                <span class="chip">{{ sortedOther().length }}</span>
              </button>
              @if (otherIsOpen()) {
                <p class="muted small other-hint">Every channel of the organization can be used from this workspace; these just aren't marked as relevant here.</p>
                <div class="grid grid-auto">
                  @for (ch of sortedOther(); track ch.id) {
                    <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: ch }" />
                  }
                </div>
              }
            </section>
          }
        }
      }
    </div>

    <app-subscribers-drawer [channel]="subsChannel()" [initialTab]="subsTab()" (closed)="subsChannel.set(null)" />
    <app-add-subreddit-dialog [channel]="subredditFrom()" (closed)="subredditFrom.set(null)" />

    <app-connect-dialog
      [open]="connectOpen()"
      [preset]="preset()"
      [presetServer]="presetServer()"
      (closed)="connectOpen.set(false)"
      (connected)="connectOpen.set(false)"
    />

    <ng-template #cardTpl let-ch>
            <article class="card ch-card" [class.warn]="ch.status === 'needs_reauth'" [class.not-relevant]="ch.relevant === false" [style.--ch]="color(ch)">
              <div class="ch-top">
                <app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="48" [ring]="color(ch)" />
                <div class="ch-id">
                  @if (editing() === ch.id) {
                    <form class="row" (ngSubmit)="saveName(ch)">
                      <input
                        class="input sm"
                        name="name"
                        [(ngModel)]="nameDraft"
                        [attr.aria-label]="'Name for ' + ch.name"
                        (keydown.escape)="editing.set(null)"
                        autofocus
                      />
                      <button type="submit" class="btn sm icon primary" aria-label="Save name"><app-icon name="check" [size]="14" /></button>
                    </form>
                  } @else {
                    <h3 class="truncate" [title]="ch.name">{{ ch.name }}</h3>
                  }
                  <div class="muted small truncate">
                    {{ meta(ch.provider).label }}
                    @if (ch.handle) {
                      · {{ ch.handle.startsWith('@') ? ch.handle : '@' + ch.handle }}
                    }
                  </div>
                </div>
                <app-status-chip [status]="ch.status" />
                @if (ws.isAdmin()) {
                  <button
                    type="button"
                    class="star"
                    [class.on]="ch.relevant !== false"
                    [attr.aria-pressed]="ch.relevant !== false"
                    [attr.aria-label]="'Relevant for this workspace: ' + ch.name"
                    [title]="ch.relevant !== false ? 'Relevant for this workspace — click to unmark' : 'Mark as relevant for this workspace'"
                    [disabled]="relBusy().has(ch.id)"
                    (click)="toggleRelevance(ch)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></svg>
                  </button>
                } @else if (ch.relevant !== false) {
                  <span class="star on static" title="Relevant for this workspace" aria-label="Relevant for this workspace"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></svg></span>
                }
              </div>

              @if (ch.teams?.length || ch.approval_required || relevantIn(ch) || kindLabel(ch) || extraChips(ch).length) {
                <div class="row-wrap ch-teams">
                  @if (kindLabel(ch); as k) {
                    <span class="chip accent">{{ k }}</span>
                  }
                  @for (c of extraChips(ch); track c) {
                    <span class="chip outline">{{ c }}</span>
                  }
                  @if (relevantIn(ch); as r) {
                    <span class="chip info" [title]="'Relevant in: ' + workspaceNames(ch)">
                      <app-icon name="layers" [size]="12" /> Relevant in: {{ r }}
                    </span>
                  }
                  @for (t of ch.teams ?? []; track t.id) {
                    <span class="chip outline" [title]="'Team: ' + t.name"><span class="color-dot" [style.background]="t.color" style="width: 8px; height: 8px"></span>{{ t.name }}</span>
                  }
                  @if (ch.approval_required) {
                    <span class="chip warning" title="Your posts to this channel need a reviewer's approval">Approval required</span>
                  }
                </div>
              }

              <dl class="ch-stats">
                <div>
                  <dt>{{ isNewsletter(ch) ? 'List size' : 'Followers' }}</dt>
                  <dd class="tabular">
                    @if (ch.followers_count === null) {
                      —
                    } @else if (isNewsletter(ch)) {
                      {{ ch.followers_count | num }} {{ ch.followers_count === 1 ? 'subscriber' : 'subscribers' }}
                    } @else {
                      {{ ch.followers_count | num }}
                    }
                  </dd>
                </div>
                <div>
                  <dt>Connected</dt>
                  <dd>{{ ch.created_at ? (ch.created_at | tzDate: 'date') : '—' }}</dd>
                </div>
                @if (ch.token_expires_at) {
                  <div>
                    <dt>Access</dt>
                    <dd [class.warning-text]="expiresSoon(ch)" [title]="ch.token_expires_at | tzDate">
                      {{ expired(ch) ? 'expired' : 'expires ' + (ch.token_expires_at | relTime) }}
                    </dd>
                  </div>
                }
              </dl>

              @if (supportsFirstComment(ch)) {
                <label class="switch fc-switch" [title]="'Applies to new posts on ' + ch.name + ' unless a post overrides it'">
                  <input
                    type="checkbox"
                    [checked]="!!ch.config['links_in_first_comment']"
                    [disabled]="!ws.canWrite() || savingCfg().has(ch.id)"
                    (change)="setLinksInComment(ch, $any($event.target).checked)"
                  />
                  <span class="track"></span>
                  <span class="small">Put links in the first comment by default</span>
                </label>
              }

              @if (ch.provider === 'reddit' && ws.isAdmin()) {
                <div class="row-wrap wa-row">
                  <button type="button" class="btn sm soft" (click)="subredditFrom.set(ch)">
                    <app-icon name="plus" [size]="14" /> Add subreddit
                  </button>
                  <span class="muted tiny">Uses this Reddit account</span>
                </div>
              }

              @if (ch.provider === 'whatsapp') {
                <div class="row-wrap wa-row">
                  <button type="button" class="btn sm soft" (click)="openSubscribers(ch, 'subscribers')">
                    <app-icon name="users" [size]="14" /> Subscribers ({{ ch.setup?.subscribers ?? 0 }})
                  </button>
                  <button type="button" class="link-btn small" (click)="openSubscribers(ch, 'webhook')">Webhook setup</button>
                </div>
              }

              @if (ch.provider === 'qq' && ch.setup) {
                <details class="setup">
                  <summary class="small strong">Bot setup</summary>
                  <div class="stack-sm setup-body">
                    <span class="label small">Callback URL</span>
                    <div class="row">
                      <code class="mono-box truncate">{{ ch.setup.webhook_url }}</code>
                      <button type="button" class="btn sm" (click)="copy(ch.setup.webhook_url)"><app-icon name="copy" [size]="14" /> Copy</button>
                    </div>
                    <ol class="steps small">
                      <li>Set this callback URL in the QQ Open Platform (q.qq.com → your bot → development settings).</li>
                      <li>Add the bot to a group and @-mention it once so Markette learns the group.</li>
                      <li>The group owner must enable 「机器人主动在群聊内发言」.</li>
                      <li>Links aren't allowed in QQ group messages; posts with links are rejected for groups.</li>
                    </ol>
                  </div>
                </details>
              }

              @if (ch.provider === 'webhook') {
                <app-webhook-setup [channel]="ch" />
              }

              @if (ch.status === 'needs_reauth' || ch.last_error) {
                <div class="notice" [class.warning]="ch.status === 'needs_reauth'" [class.danger]="ch.status !== 'needs_reauth'">
                  <app-icon name="alert" [size]="16" />
                  <span class="small">{{ ch.last_error || 'Access to this account was revoked or expired.' }}</span>
                </div>
              }

              <div class="ch-actions">
                @if (ch.profile_url || ch.base_url) {
                  <a class="btn sm ghost" [href]="ch.profile_url || ch.base_url" target="_blank" rel="noopener">
                    <app-icon name="external" [size]="14" /> View
                  </a>
                }
                @if (ws.canWrite()) {
                  <button type="button" class="btn sm ghost" (click)="sync(ch)" [disabled]="syncing().has(ch.id)">
                    @if (syncing().has(ch.id)) {
                      <span class="spinner"></span>
                    } @else {
                      <app-icon name="refresh" [size]="14" />
                    }
                    Sync
                  </button>
                }
                @if (ws.canWrite() && catalog.provider(ch.provider)?.history && ch.status === 'active') {
                  <button
                    type="button"
                    class="btn sm ghost"
                    (click)="importHistory(ch)"
                    [disabled]="importing().has(ch.id)"
                    title="Bring in this account's latest posts and their numbers, so analytics and best times start with data"
                  >
                    @if (importing().has(ch.id)) {
                      <span class="spinner"></span>
                    } @else {
                      <app-icon name="upload" [size]="14" />
                    }
                    Import past posts
                  </button>
                }
                <span class="spacer"></span>
                @if (ws.isAdmin() && ch.status === 'needs_reauth') {
                  <button type="button" class="btn sm primary" (click)="reconnect(ch)">Reconnect</button>
                }
                @if (ws.canWrite()) {
                  <label class="color-pick" [title]="'Calendar colour for ' + ch.name">
                    <span class="sr-only">Colour for {{ ch.name }}</span>
                    <input type="color" [value]="color(ch)" (change)="setColor(ch, $any($event.target).value)" />
                  </label>
                  <button type="button" class="btn sm icon ghost" (click)="startRename(ch)" [attr.aria-label]="'Rename ' + ch.name" title="Rename">
                    <app-icon name="edit" [size]="14" />
                  </button>
                }
                @if (ws.isOrgAdmin()) {
                  <a class="btn sm icon ghost" routerLink="/organization" [queryParams]="{ org: ws.active()?.organization }" fragment="channels" title="Manage relevance" [attr.aria-label]="'Manage relevance of ' + ch.name">
                    <app-icon name="layers" [size]="14" />
                  </a>
                  <button
                    type="button"
                    class="btn sm icon danger-ghost"
                    (click)="disconnect(ch)"
                    [attr.aria-label]="'Disconnect ' + ch.name + ' for the whole organization'"
                    title="Disconnect for the whole organization"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                } @else if (ws.isAdmin() && ch.relevant !== false) {
                  <button type="button" class="btn sm ghost" (click)="setRelevant(ch, false)" [disabled]="relBusy().has(ch.id)" title="Mark not relevant for this workspace">
                    Mark not relevant
                  </button>
                }
              </div>
            </article>
    </ng-template>
  `,
  styles: `
    .ch-section {
      margin-bottom: 28px;
    }
    .empty-rel,
    .other-hint {
      margin-bottom: 14px;
    }
    .section-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 0;
      background: none;
      padding: 4px 0;
      margin-bottom: 12px;
      font: inherit;
      color: var(--text);
      cursor: pointer;
    }
    .section-toggle h2 {
      font-size: 1.05rem;
    }
    .star {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 0;
      background: transparent;
      color: var(--faint);
      cursor: pointer;
      flex: none;
    }
    .star:hover:not(:disabled):not(.static) {
      background: var(--surface-hover);
      color: var(--warning);
    }
    .star.on {
      color: var(--warning);
    }
    .star.on svg {
      fill: currentColor;
    }
    .star.static {
      cursor: default;
    }
    .ch-card.not-relevant {
      opacity: 0.88;
    }
    .ch-teams {
      gap: 6px;
    }
    .wa-row {
      gap: 12px;
    }
    .setup {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 12px;
    }
    .setup summary {
      cursor: pointer;
    }
    .setup-body {
      margin-top: 10px;
    }
    .mono-box {
      flex: 1;
      padding: 6px 9px;
      border-radius: 8px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
      font-size: 0.75rem;
    }
    .steps {
      margin: 6px 0 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .fc-switch {
      font-size: 0.85rem;
    }
    .ch-card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
      overflow: hidden;
    }
    .ch-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: var(--ch);
    }
    .ch-card.warn {
      border-color: color-mix(in srgb, var(--warning) 45%, var(--border));
    }
    .ch-top {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .ch-id {
      flex: 1;
      min-width: 0;
    }
    .ch-id h3 {
      font-size: 1rem;
    }
    .ch-stats {
      display: flex;
      gap: 20px;
      margin: 0;
      flex-wrap: wrap;
    }
    .ch-stats dt {
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .ch-stats dd {
      margin: 2px 0 0;
      font-weight: 700;
    }
    .ch-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: auto;
      border-top: 1px solid var(--border);
      padding-top: 12px;
      flex-wrap: wrap;
    }
    .color-pick {
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .color-pick:hover {
      background: var(--surface-hover);
    }
    .color-pick::after {
      content: '';
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ch);
      box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--border-strong);
      pointer-events: none;
    }
    .color-pick input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
    }
    .color-pick:focus-within {
      box-shadow: var(--focus);
    }
  `,
})
export class ChannelsPage implements OnInit {
  protected readonly catalog = inject(CatalogService);
  protected readonly ws = inject(WorkspaceService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly syncing = signal<Set<number>>(new Set());
  protected readonly editing = signal<number | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly connectOpen = signal(false);
  protected readonly preset = signal<string | null>(null);
  protected readonly presetServer = signal('');
  protected readonly teamFilter = signal<number | null>(null);

  /** "Other channels" section: open by default only when nothing is relevant here. */
  protected readonly otherOpen = signal<boolean | null>(null);
  protected readonly relBusy = signal<Set<number>>(new Set());
  protected readonly orgName = computed(() => this.ws.organization()?.name || this.ws.active()?.organization_name || 'your organization');

  protected readonly reauth = computed(() => this.catalog.channels().filter((c) => c.status === 'needs_reauth'));
  protected readonly sorted = computed(() => {
    const rank = { needs_reauth: 0, active: 1, disabled: 2 } as Record<string, number>;
    const tf = this.teamFilter();
    const list = this.catalog.channels().filter((c) =>
      tf === null ? true : tf === 0 ? !(c.teams ?? []).length : (c.teams ?? []).some((t) => t.id === tf),
    );
    return [...list].sort(
      (a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || a.name.localeCompare(b.name),
    );
  });

  protected readonly sortedRelevant = computed(() => this.sorted().filter((c) => c.relevant !== false));
  protected readonly sortedOther = computed(() => this.sorted().filter((c) => c.relevant === false));
  protected readonly otherIsOpen = computed(() => this.otherOpen() ?? this.sortedRelevant().length === 0);

  protected meta = providerMeta;
  protected color = channelColor;

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    const connected = qp.get('connected');
    const error = qp.get('error');
    if (connected) this.toast.success(`${providerMeta(connected).label} connected`, 'The account is ready to publish to.');
    if (error) this.toast.error('Connection failed', error);
    if (connected || error) {
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
    this.reload(!!connected);
    this.catalog.loadProviders().subscribe({ error: () => undefined });
    this.catalog.loadTeams().subscribe({ error: () => undefined });
  }

  protected reload(force = true) {
    this.loading.set(true);
    this.loadError.set('');
    this.catalog.loadChannels(force).subscribe({
      next: () => this.loading.set(false),
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  protected expired(ch: Channel): boolean {
    return !!ch.token_expires_at && new Date(ch.token_expires_at).getTime() < Date.now();
  }

  protected expiresSoon(ch: Channel): boolean {
    return !!ch.token_expires_at && new Date(ch.token_expires_at).getTime() - Date.now() < SOON_MS;
  }

  protected openConnect() {
    this.preset.set(null);
    this.presetServer.set('');
    this.connectOpen.set(true);
  }

  protected reconnect(ch: Channel) {
    this.preset.set(ch.provider);
    this.presetServer.set(ch.provider === 'mastodon' ? ch.base_url : '');
    this.connectOpen.set(true);
  }

  protected readonly importing = signal(new Set<number>());

  protected importHistory(ch: Channel) {
    this.importing.update((s) => new Set(s).add(ch.id));
    const done = () =>
      this.importing.update((s) => {
        const n = new Set(s);
        n.delete(ch.id);
        return n;
      });
    type Job = { status: string; imported: number; found: number; error: string } | null;
    const poll = (attempt: number) => {
      this.api.get<Job>(`channels/${ch.id}/import-history/`).subscribe({
        next: (job) => {
          if (job && (job.status === 'queued' || job.status === 'running') && attempt < 40) {
            setTimeout(() => poll(attempt + 1), 3000);
            return;
          }
          done();
          if (!job) return;
          if (job.status === 'done')
            this.toast.success(
              job.imported ? `Imported ${job.imported} posts from ${ch.name}` : `Nothing new to import from ${ch.name}`,
              job.imported ? 'Their numbers appear in Analytics as they are collected; best times were updated.' : '',
            );
          else if (job.status === 'failed') this.toast.error(`Import from ${ch.name} failed`, job.error);
        },
        error: () => done(),
      });
    };
    this.api.post<Job>(`channels/${ch.id}/import-history/`, { limit: 200 }).subscribe({
      next: () => poll(0),
      error: (err) => {
        done();
        this.toast.error(`Could not import from ${ch.name}`, err);
      },
    });
  }

  protected sync(ch: Channel) {
    this.syncing.update((s) => new Set(s).add(ch.id));
    const done = () =>
      this.syncing.update((s) => {
        const n = new Set(s);
        n.delete(ch.id);
        return n;
      });
    this.api.post<Channel>(`channels/${ch.id}/sync/`).subscribe({
      next: (c) => {
        done();
        this.catalog.upsertChannel(c);
        this.toast.success(`${c.name} is up to date`);
      },
      error: (err) => {
        done();
        this.toast.error(`Could not sync ${ch.name}`, err);
        // A failed sync may have flagged the channel for re-auth.
        this.catalog.loadChannels(true).subscribe({ error: () => undefined });
      },
    });
  }

  protected setColor(ch: Channel, color: string) {
    if (!color || color === ch.color) return;
    this.catalog.upsertChannel({ ...ch, color });
    this.api.patch<Channel>(`channels/${ch.id}/`, { color }).subscribe({
      next: (c) => this.catalog.upsertChannel(c),
      error: (err) => {
        this.catalog.upsertChannel(ch);
        this.toast.error('Could not change the colour', err);
      },
    });
  }

  protected startRename(ch: Channel) {
    this.nameDraft.set(ch.name);
    this.editing.set(ch.id);
  }

  protected saveName(ch: Channel) {
    const name = this.nameDraft().trim();
    this.editing.set(null);
    if (!name || name === ch.name) return;
    this.api.patch<Channel>(`channels/${ch.id}/`, { name }).subscribe({
      next: (c) => {
        this.catalog.upsertChannel(c);
        this.toast.success('Channel renamed');
      },
      error: (err) => this.toast.error('Could not rename the channel', err),
    });
  }

  protected readonly subsChannel = signal<Channel | null>(null);
  /** Reddit channel whose account is used for "Add subreddit". */
  protected readonly subredditFrom = signal<Channel | null>(null);
  protected readonly subsTab = signal<'subscribers' | 'webhook'>('subscribers');

  protected openSubscribers(ch: Channel, tab: 'subscribers' | 'webhook') {
    this.subsTab.set(tab);
    this.subsChannel.set(ch);
  }

  /** Extra identity chip for messaging providers. */
  protected isNewsletter(ch: Channel): boolean {
    return (this.catalog.provider(ch.provider)?.kind ?? providerMeta(ch.provider).kind) === 'newsletter';
  }

  /** Provider defaults worth seeing on the card (YouTube privacy/category, Discord forum). */
  protected extraChips(ch: Channel): string[] {
    const out: string[] = [];
    if (ch.provider === 'youtube') {
      const privacy = String(ch.config['privacy'] || 'public');
      out.push(`Default: ${privacy.charAt(0).toUpperCase()}${privacy.slice(1)}`);
      const cat = YOUTUBE_CATEGORIES[String(ch.config['category_id'] ?? '22')];
      if (cat) out.push(cat);
    }
    if (ch.provider === 'discord' && ch.config['forum']) out.push('Forum channel');
    if (ch.provider === 'reddit') {
      if (ch.config['moderator']) out.push('Moderator');
      const sub = String(ch.config['submission_type'] || 'any');
      if (sub === 'self') out.push('Text posts only');
      if (sub === 'link') out.push('Link posts only');
      if (ch.config['nsfw']) out.push('NSFW');
    }
    return out;
  }

  protected kindLabel(ch: Channel): string | null {
    if (ch.provider === 'qq') {
      const kind = ch.config['kind'] ?? (ch.external_id?.startsWith('group:') ? 'group' : ch.external_id?.startsWith('channel:') ? 'channel' : null);
      return kind === 'group' ? 'QQ group' : kind === 'channel' ? 'QQ Guild channel' : null;
    }
    if (ch.provider === 'wechat') {
      return ch.config['mode'] === 'publish' ? 'Publish link only' : 'Push to followers';
    }
    if (ch.provider === 'reddit') {
      const user = String(ch.config['username'] || ch.name);
      return ch.external_id?.startsWith('u_') ? `u/${user} (profile)` : `r/${ch.config['subreddit'] || ch.external_id}`;
    }
    return null;
  }

  protected async copy(text: string | null | undefined) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  }

  /** "A, B (+N)": workspaces this channel is relevant in. */
  protected relevantIn(ch: Channel): string | null {
    const names = (ch.workspaces ?? []).map((w) => w.name);
    const total = Math.max(ch.shared_count ?? names.length, names.length);
    if (!total) return null;
    const shown = names.slice(0, 2);
    const rest = total - shown.length;
    return shown.length ? `${shown.join(', ')}${rest > 0 ? ` (+${rest})` : ''}` : `${total} workspaces`;
  }

  protected workspaceNames(ch: Channel): string {
    return (ch.workspaces ?? []).map((w) => w.name).join(', ');
  }

  protected supportsFirstComment(ch: Channel): boolean {
    const p = this.catalog.provider(ch.provider);
    return p ? !!p.supports_first_comment : ['linkedin', 'facebook', 'instagram'].includes(ch.provider);
  }

  protected readonly savingCfg = signal<Set<number>>(new Set());

  protected setLinksInComment(ch: Channel, on: boolean) {
    this.savingCfg.update((s) => new Set(s).add(ch.id));
    const done = () =>
      this.savingCfg.update((s) => {
        const n = new Set(s);
        n.delete(ch.id);
        return n;
      });
    this.api.patch<Channel>(`channels/${ch.id}/`, { config: { links_in_first_comment: on } }).subscribe({
      next: (c) => {
        done();
        this.catalog.upsertChannel(c);
        this.toast.success(on ? 'Links go to the first comment by default' : 'Links stay in the post by default', c.name);
      },
      error: (err) => {
        done();
        this.catalog.upsertChannel({ ...ch });
        this.toast.error('Could not change the setting', err);
      },
    });
  }

  protected toggleRelevance(ch: Channel) {
    this.setRelevant(ch, ch.relevant === false);
  }

  protected setRelevant(ch: Channel, relevant: boolean) {
    this.relBusy.update((s) => new Set(s).add(ch.id));
    const done = () =>
      this.relBusy.update((s) => {
        const n = new Set(s);
        n.delete(ch.id);
        return n;
      });
    // Optimistic: move the card right away.
    this.catalog.upsertChannel({ ...ch, relevant });
    this.catalog.setRelevance(ch.id, relevant).subscribe({
      next: (c) => {
        done();
        this.toast.success(relevant ? `${c.name} is relevant for this workspace` : `${c.name} is no longer marked relevant here`);
      },
      error: (err) => {
        done();
        this.catalog.upsertChannel(ch);
        this.toast.error('Could not change relevance', err);
      },
    });
  }

  protected async disconnect(ch: Channel) {
    const ok = await this.confirm.ask({
      title: `Disconnect ${ch.name}?`,
      message: `Disconnects this account for all workspaces of ${this.orgName()}, deleting its history (scheduled publications and published history with metrics). Posts already live on the network stay there.`,
      confirmLabel: 'Disconnect everywhere',
      danger: true,
      typeToConfirm: ch.name,
    });
    if (!ok) return;
    this.api.delete(`channels/${ch.id}/`).subscribe({
      next: () => {
        this.catalog.removeChannel(ch.id);
        this.toast.success(`${ch.name} disconnected`);
      },
      error: (err) => this.toast.error('Could not disconnect the channel', err),
    });
  }
}
