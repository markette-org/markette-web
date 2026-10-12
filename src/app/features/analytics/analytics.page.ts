import { HttpClient } from '@angular/common/http';
import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, toParams } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { AnalyticsOverview, AudienceSeries } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { BarChartComponent, BarDatum } from '../../shared/components/bar-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { LineChartComponent, LineSeries } from '../../shared/components/line-chart.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { NumPipe, PctPipe } from '../../shared/pipes/num.pipe';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { addDays, daysBetween, formatDayLabel, parseYmd, todayYmd } from '../../shared/utils/dates';
import { channelColor } from '../../shared/utils/providers';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

@Component({
  selector: 'app-analytics-page',
  imports: [MoreChannelsComponent, 
    FormsModule,
    RouterLink,
    IconComponent,
    ProviderIconComponent,
    BarChartComponent,
    LineChartComponent,
    EmptyStateComponent,
    NumPipe,
    PctPipe,
    TzDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">Performance</div>
          <h1>Analytics</h1>
          <p class="subtitle">Publications in the period, with their latest metrics. Dates in {{ ws.timezone() }}.</p>
        </div>
        <div class="actions">
          <button type="button" class="btn" (click)="exportCsv()" [disabled]="exporting()">
            @if (exporting()) {
              <span class="spinner"></span>
            } @else {
              <app-icon name="upload" [size]="16" />
            }
            Export CSV
          </button>
          @if (ws.isAdmin()) {
            <a class="btn ghost" routerLink="/settings" fragment="reports"><app-icon name="send" [size]="16" /> Scheduled reports</a>
          }
        </div>
      </header>

      <div class="card tight filters" role="group" aria-label="Filters">
        <div class="segmented" role="group" aria-label="Quick ranges">
          @for (p of presets; track p) {
            <button type="button" [attr.aria-pressed]="activePreset() === p" (click)="preset(p)">{{ p }}d</button>
          }
        </div>
        <div class="field inline">
          <label for="a-from">From</label>
          <input id="a-from" type="date" class="input sm" [ngModel]="from()" (ngModelChange)="setFrom($event)" [max]="to()" />
        </div>
        <div class="field inline">
          <label for="a-to">To</label>
          <input id="a-to" type="date" class="input sm" [ngModel]="to()" (ngModelChange)="setTo($event)" [min]="from()" />
        </div>
        <div class="field inline">
          <label for="a-campaign">Campaign</label>
          <select id="a-campaign" class="select sm" [ngModel]="campaign()" (ngModelChange)="campaign.set($event); load()">
            <option [ngValue]="null">All campaigns</option>
            @for (c of catalog.campaigns(); track c.id) {
              <option [ngValue]="c.id">{{ c.name }}</option>
            }
          </select>
        </div>
        @if (catalog.channels().length) {
          <div class="channel-filter" role="group" aria-label="Channels">
            @for (ch of catalog.relevantChannels(); track ch.id) {
              <button
                type="button"
                class="chip outline ch-chip"
                [class.on]="selected().includes(ch.id)"
                [attr.aria-pressed]="selected().includes(ch.id)"
                (click)="toggleChannel(ch.id)"
                [style.--c]="colorOf(ch.id)"
              >
                <app-provider-icon [provider]="ch.provider" [size]="14" /> {{ ch.name }}
              </button>
            }
            <app-more-channels label="More from your organization" hint="" [count]="catalog.otherChannels().length" [forceOpen]="otherSelected()">
              <div class="channel-filter">
                @for (ch of catalog.otherChannels(); track ch.id) {
                  <button
                    type="button"
                    class="chip outline ch-chip"
                    [class.on]="selected().includes(ch.id)"
                    [attr.aria-pressed]="selected().includes(ch.id)"
                    (click)="toggleChannel(ch.id)"
                    [style.--c]="colorOf(ch.id)"
                  >
                    <app-provider-icon [provider]="ch.provider" [size]="14" /> {{ ch.name }}
                  </button>
                }
              </div>
            </app-more-channels>
            @if (selected().length) {
              <button type="button" class="link-btn small" (click)="selected.set([]); load()">Clear</button>
            }
          </div>
        }
      </div>

      @if (error()) {
        <div class="form-error" role="alert" style="margin-bottom: 16px">{{ error() }}</div>
      }

      <section class="grid grid-4 kpis" aria-label="Totals">
        @for (k of kpis(); track k.label) {
          <div class="card kpi">
            <span class="kpi-label"><app-icon [name]="k.icon" [size]="14" /> {{ k.label }}</span>
            @if (loading()) {
              <span class="skeleton" style="height: 30px; width: 60%"></span>
            } @else {
              <span class="kpi-value">{{ k.value | num }}</span>
            }
            @if (k.foot) {
              <span class="kpi-foot">{{ k.foot }}</span>
            }
          </div>
        }
      </section>

      @if (!loading() && overview() && !overview()!.totals.posts) {
        <div class="card" style="margin-bottom: 16px">
          <app-empty-state icon="analytics" title="No publications in this period" text="Metrics appear here once posts are published. Try a wider date range or publish something.">
            <a routerLink="/compose" class="btn primary sm">Compose a post</a>
          </app-empty-state>
        </div>
      }

      <div class="grid grid-2">
        <section class="card" aria-labelledby="eng-h">
          <div class="card-head">
            <h2 id="eng-h">Engagements per day</h2>
            <span class="muted small">{{ overview()?.totals?.engagements | num }} total</span>
          </div>
          <app-bar-chart [data]="engagementBars()" unit="engagements" label="Engagements per day" />
        </section>
        <section class="card" aria-labelledby="imp-h">
          <div class="card-head">
            <h2 id="imp-h">Impressions per day</h2>
            <span class="muted small">{{ overview()?.totals?.impressions | num }} total</span>
          </div>
          <app-bar-chart [data]="impressionBars()" color="var(--coral)" unit="impressions" label="Impressions per day" />
        </section>
      </div>

      <section class="card flush section" aria-labelledby="ch-h">
        <div class="card-head pad">
          <h2 id="ch-h">By channel</h2>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Channel</th>
                <th class="num">Posts</th>
                <th class="num">Impressions</th>
                <th class="num">Engagements</th>
                <th class="num">Likes</th>
                <th class="num">Comments</th>
                <th class="num">Shares</th>
                <th class="num" title="Clicks on short links">Link clicks</th>
                <th class="num">Avg. eng. rate</th>
              </tr>
            </thead>
            <tbody>
              @for (c of overview()?.channels ?? []; track c.channel) {
                <tr>
                  <td>
                    <span class="row"><app-provider-icon [provider]="c.provider" [size]="20" /> <span class="strong">{{ c.name }}</span></span>
                  </td>
                  <td class="num">{{ c.posts | num }}</td>
                  <td class="num">{{ c.impressions | num }}</td>
                  <td class="num strong">{{ c.engagements | num }}</td>
                  <td class="num">{{ c.likes | num }}</td>
                  <td class="num">{{ c.comments | num }}</td>
                  <td class="num">{{ c.shares | num }}</td>
                  <td class="num">{{ c.link_clicks | num }}</td>
                  <td class="num">{{ c.avg_engagement_rate | pct: 2 }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="muted" style="text-align: center; padding: 24px">No channel published in this period.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid grid-2 section">
        <section class="card" aria-labelledby="top-h">
          <div class="card-head"><h2 id="top-h">Top posts</h2></div>
          <ol class="list-reset top-list">
            @for (t of overview()?.top_posts ?? []; track t.target; let i = $index) {
              <li>
                <span class="rank tabular">{{ i + 1 }}</span>
                <app-provider-icon [provider]="t.provider" [size]="22" />
                <div class="top-text">
                  <a [routerLink]="['/posts', t.post]" class="strong truncate">{{ t.title || 'Untitled post' }}</a>
                  <span class="muted tiny">{{ t.channel }} · {{ t.published_at | tzDate: 'short' }}</span>
                </div>
                <span class="top-num tabular"><strong>{{ t.metrics.engagements | num }}</strong><span class="muted tiny">eng.</span></span>
                @if (t.url) {
                  <a [href]="t.url" target="_blank" rel="noopener" class="btn ghost icon sm" [attr.aria-label]="'Open on ' + t.channel">
                    <app-icon name="external" [size]="15" />
                  </a>
                }
              </li>
            } @empty {
              <li class="muted small">Nothing published yet in this period.</li>
            }
          </ol>
        </section>
        <section class="card" aria-labelledby="aud-h">
          <div class="card-head"><h2 id="aud-h">Audience growth</h2><span class="muted small">Followers</span></div>
          <app-line-chart [series]="audienceSeries()" [xFormat]="xFormat" label="Followers per channel" emptyText="Follower history appears after a few daily syncs." />
        </section>
      </div>
    </div>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px 16px;
      margin-bottom: 16px;
    }
    .field.inline {
      gap: 3px;
    }
    .field.inline label {
      font-size: 0.72rem;
    }
    .channel-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      flex-basis: 100%;
    }
    .ch-chip {
      height: 28px;
      opacity: 0.7;
    }
    .ch-chip.on {
      opacity: 1;
      border-color: var(--c);
      background: color-mix(in srgb, var(--c) 12%, transparent);
      color: var(--text);
    }
    .kpis,
    .section {
      margin-bottom: 16px;
    }
    .grid-2 {
      margin-bottom: 16px;
    }
    .pad {
      padding: 18px 20px 0;
    }
    .top-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .top-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .top-list li:last-child {
      border-bottom: 0;
    }
    .rank {
      width: 20px;
      color: var(--muted);
      font-weight: 700;
      font-size: 0.85rem;
    }
    .top-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .top-num {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.1;
    }
  `,
})
export class AnalyticsPage implements OnInit {
  protected readonly otherSelected = computed(() => this.selected().some((id) => !this.catalog.isRelevant(id)));
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly exporting = signal(false);

  /** Downloads every publication of the period (with the current filters) as CSV. */
  protected exportCsv() {
    this.exporting.set(true);
    const params = toParams({ from: this.from(), to: this.to(), channels: this.selected(), campaign: this.campaign() });
    this.http.get(this.api.url('analytics/export/'), { params, responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `markette-${this.from()}-${this.to()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error('Export failed');
      },
    });
  }
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly presets = [7, 30, 90];
  private readonly today = todayYmd(this.ws.timezone());
  protected readonly from = signal(addDays(this.today, -29));
  protected readonly to = signal(this.today);
  protected readonly selected = signal<number[]>([]);
  protected readonly campaign = signal<number | null>(null);

  protected readonly overview = signal<AnalyticsOverview | null>(null);
  protected readonly audience = signal<AudienceSeries[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly xFormat = (x: number) => formatDayLabel(new Date(x).toISOString().slice(0, 10), { day: 'numeric', month: 'short' });

  protected readonly activePreset = computed(() =>
    this.to() === this.today ? this.presets.find((p) => daysBetween(this.from(), this.to()) === p - 1) ?? null : null,
  );

  protected readonly kpis = computed(() => {
    const o = this.overview();
    const t = o?.totals;
    return [
      { label: 'Engagements', icon: 'heart', value: t?.engagements ?? null, foot: t ? `${t.likes} likes · ${t.comments} comments · ${t.shares} shares` : '' },
      { label: 'Impressions', icon: 'eye', value: t?.impressions ?? null, foot: t?.reach ? `Reach ${t.reach}` : '' },
      { label: 'Publications', icon: 'send', value: t?.posts ?? null, foot: o ? `${o.scheduled} scheduled next` : '' },
      {
        label: 'Clicks',
        icon: 'link',
        value: t ? (t.clicks || 0) + (t.link_clicks || 0) : null,
        foot: t ? [t.link_clicks ? `${t.link_clicks} on short links` : '', t.clicks ? `${t.clicks} reported by networks` : '', t.saves ? `${t.saves} saves` : ''].filter(Boolean).join(' · ') : '',
      },
    ];
  });

  protected readonly engagementBars = computed<BarDatum[]>(() =>
    (this.overview()?.daily ?? []).map((d) => ({
      label: formatDayLabel(d.date, { day: 'numeric', month: 'short' }),
      title: formatDayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ` · ${d.posts} posts`,
      value: d.engagements,
    })),
  );
  protected readonly impressionBars = computed<BarDatum[]>(() =>
    (this.overview()?.daily ?? []).map((d) => ({
      label: formatDayLabel(d.date, { day: 'numeric', month: 'short' }),
      title: formatDayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' }),
      value: d.impressions,
    })),
  );

  protected readonly audienceSeries = computed<LineSeries[]>(() => {
    const sel = this.selected();
    return this.audience()
      .filter((s) => !sel.length || sel.includes(s.channel))
      .map((s) => ({
        name: s.name,
        color: this.colorOf(s.channel),
        points: s.points.map((p) => {
          const { year, month, day } = parseYmd(String(p.date).slice(0, 10));
          return { x: Date.UTC(year, month - 1, day), y: p.followers };
        }),
      }));
  });

  ngOnInit() {
    this.catalog.loadChannels().subscribe({ error: () => undefined });
    this.catalog.loadCampaigns().subscribe({ error: () => undefined });
    const q = this.route.snapshot.queryParamMap;
    const f = q.get('from');
    const t = q.get('to');
    if (f && YMD_RE.test(f)) this.from.set(f);
    if (t && YMD_RE.test(t)) this.to.set(t);
    const chs = q.get('channels');
    if (chs) this.selected.set(chs.split(',').map(Number).filter((n) => !isNaN(n)));
    const camp = q.get('campaign');
    if (camp && !isNaN(+camp)) this.campaign.set(+camp);
    this.load();
  }

  protected colorOf(id: number): string {
    return channelColor(this.catalog.channel(id));
  }

  protected preset(days: number) {
    this.to.set(this.today);
    this.from.set(addDays(this.today, -(days - 1)));
    this.load();
  }

  protected setFrom(v: string) {
    if (!YMD_RE.test(v)) return;
    this.from.set(v);
    if (v > this.to()) this.to.set(v);
    this.load();
  }

  protected setTo(v: string) {
    if (!YMD_RE.test(v)) return;
    this.to.set(v);
    if (v < this.from()) this.from.set(v);
    this.load();
  }

  protected toggleChannel(id: number) {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    const query = {
      from: this.from(),
      to: this.to(),
      channels: this.selected(),
      campaign: this.campaign(),
    };
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        from: query.from,
        to: query.to,
        channels: query.channels.length ? query.channels.join(',') : null,
        campaign: query.campaign,
      },
    });
    forkJoin([
      this.api.get<AnalyticsOverview>('analytics/overview/', query),
      this.api.get<AudienceSeries[]>('analytics/audience/', { from: query.from, to: query.to }),
    ]).subscribe({
      next: ([o, a]) => {
        this.overview.set(o);
        this.audience.set(a);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatError(err));
      },
    });
  }
}
