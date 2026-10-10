import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { formatError } from '../../core/errors';
import { PlatformAiUsage } from '../../core/models';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { MeterComponent } from './meter.component';
import { PlatformHeaderComponent } from './platform-header.component';
import { fmtUsd } from './platform-utils';

const KIND_LABELS: Record<string, string> = {
  suggest_times: 'Suggest times',
  plan_campaign: 'Campaign plans',
  adapt_content: 'Adapt per network',
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-platform-ai-usage-page',
  imports: [FormsModule, RouterLink, PlatformHeaderComponent, MeterComponent, IconComponent, EmptyStateComponent, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="AI usage" subtitle="Tokens and estimated cost per organization and feature.">
        <div class="month-picker">
          <button type="button" class="btn icon" (click)="shift(-1)" aria-label="Previous month"><app-icon name="chevronLeft" /></button>
          <label class="sr-only" for="month">Month</label>
          <input id="month" type="month" class="input" [ngModel]="month()" (ngModelChange)="setMonth($event)" [max]="thisMonth" />
          <button type="button" class="btn icon" (click)="shift(1)" [disabled]="month() >= thisMonth" aria-label="Next month"><app-icon name="chevronRight" /></button>
        </div>
      </app-platform-header>

      @if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      }

      @if (data(); as d) {
        <p class="muted small pricing">
          <app-icon name="info" [size]="14" /> Current model <strong class="mono">{{ d.pricing.model }}</strong>. Costs are those reported by the provider (OpenRouter
          reports them); otherwise they are estimated at {{ usd(d.pricing.input_per_mtok) }} / {{ usd(d.pricing.output_per_mtok) }} per million input / output tokens.
        </p>

        <div class="grid grid-4" style="margin-bottom: 16px">
          <div class="card kpi">
            <span class="kpi-label">Estimated cost</span>
            <span class="kpi-value">{{ usd(totals().cost) }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Requests</span>
            <span class="kpi-value">{{ totals().requests | num }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Input tokens</span>
            <span class="kpi-value">{{ totals().input | num }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Output tokens</span>
            <span class="kpi-value">{{ totals().output | num }}</span>
          </div>
        </div>

        <section class="card flush">
          <div class="card-head pad"><h2>By organization</h2></div>
          @if (d.organizations.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th class="num">Requests</th>
                    <th class="num">Input</th>
                    <th class="num">Output</th>
                    <th>Quota use</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  @for (o of d.organizations; track o.organization) {
                    <tr>
                      <td><a [routerLink]="['/platform/organizations', o.organization]" class="strong">{{ o.name }}</a></td>
                      <td class="num">{{ o.requests | num }}</td>
                      <td class="num">{{ o.input_tokens | num }}</td>
                      <td class="num">{{ o.output_tokens | num }}</td>
                      <td style="min-width: 160px"><app-meter [used]="o.input_tokens + o.output_tokens" [limit]="o.quota" /></td>
                      <td style="min-width: 170px">
                        <div class="cost">
                          <span class="cost-bar"><span [style.width.%]="maxCost() ? (o.cost_usd / maxCost()) * 100 : 0"></span></span>
                          <span class="tabular strong">{{ usd(o.cost_usd) }}</span>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td class="strong">Total</td>
                    <td class="num strong">{{ totals().requests | num }}</td>
                    <td class="num strong">{{ totals().input | num }}</td>
                    <td class="num strong">{{ totals().output | num }}</td>
                    <td></td>
                    <td class="strong tabular">{{ usd(totals().cost) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          } @else {
            <app-empty-state icon="sparkles" title="No AI usage this month" text="Nobody used AI features in this period." />
          }
        </section>

        <section class="card" style="margin-top: 16px">
          <div class="card-head"><h2>By feature</h2></div>
          @if (d.by_kind.length) {
            <ul class="list-reset kinds">
              @for (k of kinds(); track k.kind) {
                <li>
                  <span class="strong">{{ k.label }}</span>
                  <span class="track"><span [style.width.%]="k.pct"></span></span>
                  <span class="tabular small muted">{{ k.requests | num }} req</span>
                  <span class="tabular small muted" title="Input / output tokens">{{ k.input_tokens ?? 0 | num }} / {{ k.output_tokens ?? 0 | num }} tok</span>
                  <span class="tabular strong">{{ usd(k.cost_usd) }}</span>
                </li>
              }
            </ul>
            <p class="muted tiny" style="margin-top: 10px">Bars show each feature's share of cost.</p>
          } @else {
            <p class="muted small">No requests.</p>
          }
        </section>
      } @else if (loading()) {
        <div class="skeleton" style="height: 240px"></div>
      }
    </div>
  `,
  styles: `
    .month-picker {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .month-picker .input {
      width: 170px;
    }
    .pricing {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .pad {
      padding: 16px 20px 0;
    }
    tfoot td {
      border-top: 1px solid var(--border);
      background: var(--surface-2);
    }
    .cost {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cost-bar,
    .track {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--bg-sunken);
      overflow: hidden;
      min-width: 60px;
    }
    .cost-bar span,
    .track span {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--coral);
    }
    .kinds {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .kinds li {
      display: grid;
      grid-template-columns: 160px minmax(0, 1fr) 70px 150px 90px;
      align-items: center;
      gap: 12px;
      font-size: 0.88rem;
    }
    .kinds .tabular {
      text-align: right;
    }
    @media (max-width: 640px) {
      .kinds li {
        grid-template-columns: minmax(0, 1fr) 70px 80px;
      }
      .kinds li > :nth-child(4) {
        display: none;
      }
      .kinds .track {
        display: none;
      }
    }
  `,
})
export class PlatformAiUsagePage implements OnInit {
  private api = inject(ApiService);
  protected readonly thisMonth = currentMonth();
  protected readonly month = signal(currentMonth());
  protected readonly data = signal<PlatformAiUsage | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly usd = fmtUsd;

  protected readonly totals = computed(() => {
    const orgs = this.data()?.organizations ?? [];
    return orgs.reduce(
      (t, o) => ({
        requests: t.requests + o.requests,
        input: t.input + o.input_tokens,
        output: t.output + o.output_tokens,
        cost: t.cost + o.cost_usd,
      }),
      { requests: 0, input: 0, output: 0, cost: 0 },
    );
  });
  protected readonly maxCost = computed(() => Math.max(0, ...(this.data()?.organizations ?? []).map((o) => o.cost_usd)));
  protected readonly kinds = computed(() => {
    const list = this.data()?.by_kind ?? [];
    const max = Math.max(0, ...list.map((k) => k.cost_usd));
    return [...list]
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .map((k) => ({ ...k, label: KIND_LABELS[k.kind] ?? k.kind.replace(/_/g, ' '), pct: max ? (k.cost_usd / max) * 100 : 0 }));
  });

  ngOnInit() {
    this.load();
  }

  protected setMonth(m: string) {
    if (!/^\d{4}-\d{2}$/.test(m || '')) return;
    this.month.set(m);
    this.load();
  }

  protected shift(delta: number) {
    const next = shiftMonth(this.month(), delta);
    if (next > this.thisMonth) return;
    this.setMonth(next);
  }

  private load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<PlatformAiUsage>('platform/ai-usage/', { month: this.month() }).subscribe({
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
