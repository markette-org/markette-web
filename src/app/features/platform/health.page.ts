import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { formatError } from '../../core/errors';
import { PlatformHealth } from '../../core/models';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { providerMeta } from '../../shared/utils/providers';
import { PlatformHeaderComponent } from './platform-header.component';
import { humanizeSeconds } from './platform-utils';

@Component({
  selector: 'app-platform-health-page',
  imports: [NgTemplateOutlet, RouterLink, PlatformHeaderComponent, IconComponent, ProviderIconComponent, NumPipe, TzDatePipe, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="Health" subtitle="Is the scheduler keeping up, and what is failing? Refreshes every minute.">
        @if (checkedAt()) {
          <span class="muted small">Checked {{ checkedAt() | tzDate: 'time' }}</span>
        }
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

      @if (data(); as h) {
        <div class="status-card card" [class.ok]="h.status === 'ok'" [class.degraded]="h.status === 'degraded'" [class.paused]="h.status === 'paused' || h.publishing_paused" role="status">
          <div class="badge"><app-icon [name]="h.status === 'ok' ? 'check' : h.status === 'paused' ? 'pause' : 'alert'" [size]="26" [stroke]="2.5" /></div>
          <div style="flex: 1">
            <h2>{{ h.status === 'ok' ? 'All systems normal' : h.status === 'paused' ? 'Publishing is paused' : 'Degraded' }}</h2>
            <p class="muted">
              @switch (h.status) {
                @case ('ok') {
                  Due publications are going out on time and nothing is stuck in flight.
                }
                @case ('paused') {
                  A superadmin paused all publishing. Nothing is handed to the workers; due publications pile up as overdue and go out once publishing is resumed.
                }
                @default {
                  Publications are running late (more than 5 minutes overdue) or some are stuck while publishing. Check that the Celery worker and beat are running.
                }
              }
            </p>
          </div>
          @if (h.status === 'paused' || h.publishing_paused) {
            <a routerLink="/platform/settings" fragment="publishing" class="btn danger">Resume in settings</a>
          }
        </div>

        <div class="grid grid-4" style="margin-top: 16px">
          <div class="card kpi">
            <span class="kpi-label">Overdue publications</span>
            <span class="kpi-value" [class.warning-text]="h.overdue_targets">{{ h.overdue_targets | num }}</span>
            <span class="kpi-foot">Scheduled &gt; 2 min ago, not sent</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Oldest overdue</span>
            <span class="kpi-value" [class.warning-text]="h.oldest_overdue_seconds > 300">{{ h.oldest_overdue_seconds ? humanize(h.oldest_overdue_seconds) : '—' }}</span>
            <span class="kpi-foot">Scheduler lag</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Stuck in flight</span>
            <span class="kpi-value" [class.danger-text]="h.stuck_in_flight">{{ h.stuck_in_flight | num }}</span>
            <span class="kpi-foot">Queued/publishing for &gt; 10 min</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Last publication</span>
            <span class="kpi-value small-value">{{ h.last_published_at ? (h.last_published_at | relTime) : 'Never' }}</span>
            <span class="kpi-foot">{{ h.last_published_at | tzDate }}</span>
          </div>
        </div>

        <div class="grid grid-2" style="margin-top: 16px">
          <section class="card flush">
            <div class="card-head pad"><h2>Failures by network <span class="muted small">(7 days)</span></h2></div>
            <ng-container *ngTemplateOutlet="providerTable; context: { $implicit: failures(), empty: 'No failures in the last 7 days.' }" />
          </section>
          <section class="card flush">
            <div class="card-head pad"><h2>Channels needing reconnection</h2></div>
            <ng-container *ngTemplateOutlet="providerTable; context: { $implicit: reauth(), empty: 'Every channel is connected.' }" />
          </section>
        </div>

        <section class="card flush" style="margin-top: 16px">
          <div class="card-head pad"><h2>Recent failures <span class="muted small">({{ h.recent_failures.length }}, last 7 days)</span></h2></div>
          @if (h.recent_failures.length) {
            <ul class="list-reset failures">
              @for (f of h.recent_failures; track f.target) {
                <li>
                  <div class="row-wrap">
                    <app-provider-icon [provider]="f.provider" [size]="18" />
                    <strong>{{ f.channel }}</strong>
                    <span class="muted small">{{ f.organization }} › {{ f.workspace }}</span>
                    <span class="spacer"></span>
                    <span class="chip danger">{{ f.attempts }} {{ f.attempts === 1 ? 'attempt' : 'attempts' }}</span>
                    <span class="muted small" [attr.title]="f.at | tzDate">{{ f.at | relTime }}</span>
                  </div>
                  <pre class="err">{{ f.error || 'No error message recorded.' }}</pre>
                  <span class="muted tiny mono">publication #{{ f.target }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="muted small pad-b">Nothing failed in the last 7 days.</p>
          }
        </section>
      } @else if (loading()) {
        <div class="skeleton" style="height: 110px"></div>
      }
    </div>

    <ng-template #providerTable let-rows let-empty="empty">
      @if (rows.length) {
        <table class="table">
          <thead>
            <tr><th>Network</th><th class="num">Count</th></tr>
          </thead>
          <tbody>
            @for (r of rows; track r.key) {
              <tr>
                <td><span class="row"><app-provider-icon [provider]="r.key" [size]="18" /> {{ r.label }}</span></td>
                <td class="num strong">{{ r.count }}</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="muted small pad-b">{{ empty }}</p>
      }
    </ng-template>
  `,
  styles: `
    .status-card {
      display: flex;
      align-items: center;
      gap: 18px;
      border-width: 1.5px;
    }
    .status-card .badge {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      flex: none;
    }
    .status-card.ok {
      border-color: var(--success);
    }
    .status-card.ok .badge {
      background: var(--success-soft);
      color: var(--success);
    }
    .status-card.degraded {
      border-color: var(--warning);
    }
    .status-card.degraded .badge {
      background: var(--warning-soft);
      color: var(--warning);
    }
    .status-card.paused {
      border-color: var(--danger);
      background: var(--danger-soft);
    }
    .status-card.paused .badge {
      background: var(--danger);
      color: #fff;
    }
    .status-card p {
      margin-top: 4px;
    }
    .small-value {
      font-size: 1.3rem;
    }
    .pad {
      padding: 16px 20px 0;
    }
    .pad-b {
      padding: 0 20px 18px;
    }
    .failures li {
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .err {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      background: var(--danger-soft);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 12px;
      max-height: 160px;
      overflow: auto;
    }
  `,
})
export class PlatformHealthPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  protected readonly data = signal<PlatformHealth | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly checkedAt = signal<Date | null>(null);
  protected readonly humanize = humanizeSeconds;
  private interval: ReturnType<typeof setInterval> | null = null;

  protected readonly failures = computed(() => this.rowsOf(this.data()?.failures_by_provider));
  protected readonly reauth = computed(() => this.rowsOf(this.data()?.reauth_by_provider));

  private rowsOf(map: Record<string, number> | undefined) {
    return Object.entries(map ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, label: providerMeta(key).label }));
  }

  ngOnInit() {
    this.load();
    this.interval = setInterval(() => this.load(), 60_000);
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  protected load() {
    this.loading.set(true);
    this.api.get<PlatformHealth>('platform/health/').subscribe({
      next: (h) => {
        this.data.set(h);
        this.error.set('');
        this.checkedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(formatError(err));
        this.loading.set(false);
      },
    });
  }
}
