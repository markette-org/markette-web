import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { formatError } from '../../core/errors';
import { PlatformOverview } from '../../core/models';
import { BarChartComponent, BarDatum } from '../../shared/components/bar-chart.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { formatDayLabel } from '../../shared/utils/dates';
import { providerMeta } from '../../shared/utils/providers';
import { PlatformHeaderComponent } from './platform-header.component';
import { fmtUsd } from './platform-utils';

@Component({
  selector: 'app-platform-overview-page',
  imports: [PlatformHeaderComponent, BarChartComponent, ProviderIconComponent, IconComponent, NumPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="Overview" subtitle="Everything running on this installation.">
        <button type="button" class="btn" (click)="load()" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner"></span>
          } @else {
            <app-icon name="refresh" [size]="16" />
          }
          Refresh
        </button>
      </app-platform-header>

      @if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      }

      @if (data(); as d) {
        <div class="grid grid-4">
          <a class="card kpi tile" routerLink="/platform/organizations">
            <span class="kpi-label"><app-icon name="layers" [size]="14" /> Organizations</span>
            <span class="kpi-value">{{ d.organizations.total | num }}</span>
            <span class="kpi-foot">
              +{{ d.organizations.new_7d }} this week
              @if (d.organizations.suspended) {
                · <span class="danger-text">{{ d.organizations.suspended }} suspended</span>
              }
            </span>
          </a>
          <div class="card kpi">
            <span class="kpi-label"><app-icon name="dashboard" [size]="14" /> Active workspaces</span>
            <span class="kpi-value">{{ d.workspaces | num }}</span>
            <span class="kpi-foot">Not archived</span>
          </div>
          <a class="card kpi tile" routerLink="/platform/users">
            <span class="kpi-label"><app-icon name="users" [size]="14" /> Users</span>
            <span class="kpi-value">{{ d.users.total | num }}</span>
            <span class="kpi-foot">{{ d.users.active_7d | num }} active · +{{ d.users.new_7d }} new this week</span>
          </a>
          <div class="card kpi">
            <span class="kpi-label"><app-icon name="channels" [size]="14" /> Channels</span>
            <span class="kpi-value">{{ d.channels.total | num }}</span>
            <span class="kpi-foot" [class.warning-text]="d.channels.needs_reauth">{{ d.channels.needs_reauth }} need reconnecting</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label"><app-icon name="send" [size]="14" /> Published</span>
            <span class="kpi-value">{{ d.publishing.published_24h | num }}</span>
            <span class="kpi-foot">last 24 h · {{ d.publishing.published_7d | num }} in 7 days</span>
          </div>
          <a class="card kpi tile" routerLink="/platform/health">
            <span class="kpi-label"><app-icon name="alert" [size]="14" /> Failed (24 h)</span>
            <span class="kpi-value" [class.danger-text]="d.publishing.failed_24h">{{ d.publishing.failed_24h | num }}</span>
            <span class="kpi-foot">See health for details</span>
          </a>
          <div class="card kpi">
            <span class="kpi-label"><app-icon name="calendar" [size]="14" /> Scheduled</span>
            <span class="kpi-value">{{ d.publishing.scheduled | num }}</span>
            <span class="kpi-foot">Publications waiting to go out</span>
          </div>
          <a class="card kpi tile" routerLink="/platform/ai-usage">
            <span class="kpi-label"><app-icon name="sparkles" [size]="14" /> AI this month</span>
            <span class="kpi-value">{{ usd(d.ai_this_month.cost_usd) }}</span>
            <span class="kpi-foot">{{ d.ai_this_month.requests | num }} requests · {{ d.ai_this_month.input_tokens + d.ai_this_month.output_tokens | num }} tokens</span>
          </a>
        </div>

        <div class="grid two-col" style="margin-top: 16px">
          <section class="card">
            <div class="card-head">
              <h2>Published per day</h2>
              <span class="muted small">Last 30 days · {{ total30() | num }} total</span>
            </div>
            <app-bar-chart [data]="daily()" unit="published" label="Publications per day, last 30 days" />
          </section>
          <section class="card">
            <div class="card-head">
              <h2>Channels by network</h2>
            </div>
            @if (providers().length) {
              <ul class="list-reset bars">
                @for (p of providers(); track p.key) {
                  <li>
                    <app-provider-icon [provider]="p.key" [size]="20" />
                    <span class="name">{{ p.label }}</span>
                    <span class="track"><span [style.width.%]="p.pct" [style.background]="p.color"></span></span>
                    <span class="tabular strong">{{ p.count | num }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted small">No channels connected yet.</p>
            }
          </section>
        </div>
      } @else if (loading()) {
        <div class="grid grid-4">
          @for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) {
            <div class="skeleton" style="height: 110px"></div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .tile {
      color: inherit;
      text-decoration: none !important;
      transition: border-color 0.12s;
    }
    .tile:hover {
      border-color: var(--border-strong);
    }
    .two-col {
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    }
    @media (max-width: 1000px) {
      .two-col {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .bars {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bars li {
      display: grid;
      grid-template-columns: 20px 90px minmax(0, 1fr) 48px;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
    }
    .bars .tabular {
      text-align: right;
    }
    .track {
      height: 8px;
      border-radius: 4px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .track span {
      display: block;
      height: 100%;
      border-radius: 4px;
    }
  `,
})
export class PlatformOverviewPage implements OnInit {
  private api = inject(ApiService);
  protected readonly data = signal<PlatformOverview | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly usd = fmtUsd;

  protected readonly daily = computed<BarDatum[]>(() => {
    const d = this.data();
    if (!d) return [];
    const map = new Map(d.publishing.daily.map((r) => [String(r.date).slice(0, 10), r.published]));
    const out: BarDatum[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      const key = day.toISOString().slice(0, 10);
      out.push({
        label: formatDayLabel(key, { day: 'numeric', month: 'short' }),
        title: formatDayLabel(key),
        value: map.get(key) ?? 0,
      });
    }
    return out;
  });
  protected readonly total30 = computed(() => this.daily().reduce((a, b) => a + b.value, 0));
  protected readonly providers = computed(() => {
    const by = this.data()?.channels.by_provider ?? {};
    const max = Math.max(1, ...Object.values(by));
    return Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, label: providerMeta(key).label, color: providerMeta(key).color, pct: (count / max) * 100 }));
  });

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<PlatformOverview>('platform/overview/').subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(formatError(err));
        this.loading.set(false);
      },
    });
  }
}
