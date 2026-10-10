import { ExternalService } from '../../core/native/external.service';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BillingService } from '../../core/billing.service';
import { formatError } from '../../core/errors';
import { Id, OrgBilling, Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/components/icon.component';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { fmtNumber } from '../../shared/utils/format';

interface Meter {
  key: string;
  label: string;
  icon: string;
  used: number;
  limit: number | null;
  unit: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'success' },
  trialing: { label: 'Trial', cls: 'info' },
  past_due: { label: 'Payment overdue', cls: 'danger' },
  unpaid: { label: 'Unpaid', cls: 'danger' },
  canceled: { label: 'Canceled', cls: 'outline' },
  incomplete: { label: 'Incomplete', cls: 'warning' },
  incomplete_expired: { label: 'Expired', cls: 'outline' },
  paused: { label: 'Paused', cls: 'warning' },
};

/** "Plan & billing" for org admins: current plan, usage vs limits, upgrade via Stripe Checkout, portal. */
@Component({
  selector: 'app-billing-card',
  imports: [IconComponent, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'billing' },
  template: `
    <section class="card billing" aria-labelledby="billing-h">
      <div class="card-head">
        <h2 id="billing-h">Plan &amp; billing</h2>
        @if (billing()?.has_billing_account) {
          <button type="button" class="btn sm" (click)="openPortal()" [disabled]="busy() === 'portal'">
            @if (busy() === 'portal') {
              <span class="spinner"></span>
            } @else {
              <app-icon name="external" [size]="14" />
            }
            Manage billing
          </button>
        }
      </div>

      @if (loading() && !billing()) {
        <div class="skeleton" style="height: 120px"></div>
      } @else if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      } @else if (billing(); as b) {
        <!-- Current plan -->
        <div class="current">
          <div class="plan-mark"><app-icon name="layers" [size]="20" /></div>
          <div class="stack-sm" style="flex: 1; min-width: 0">
            <div class="row-wrap">
              <strong class="plan-name">{{ b.plan?.name || 'Free' }}</strong>
              @if (statusInfo(); as st) {
                <span class="chip {{ st.cls }}"><span class="dot"></span>{{ st.label }}</span>
              } @else if (!b.plan) {
                <span class="chip">Default plan</span>
              }
              @if (b.plan?.price_label) {
                <span class="muted small">{{ b.plan?.price_label }}</span>
              }
              @if (activating()) {
                <span class="chip info"><span class="spinner" style="width: 10px; height: 10px"></span>Activating…</span>
              }
            </div>
            @if (b.current_period_end) {
              <span class="muted small">
                {{ b.cancel_at_period_end ? 'Access until' : 'Renews on' }} {{ b.current_period_end | tzDate: 'date' }}
              </span>
            } @else if (!b.plan) {
              <span class="muted small">Limits set by the platform operator.</span>
            }
          </div>
        </div>
        @if (b.cancel_at_period_end && b.current_period_end) {
          <div class="notice warning" role="status" style="margin-top: 12px">
            <app-icon name="alert" [size]="16" />
            <span>
              This subscription cancels on <strong>{{ b.current_period_end | tzDate: 'date' }}</strong>; the organization then returns to the default limits.
              @if (b.has_billing_account) {
                <button type="button" class="link-btn" (click)="openPortal()">Renew in billing</button>
              }
            </span>
          </div>
        }
        @if (b.status === 'past_due' || b.status === 'unpaid') {
          <div class="notice danger" role="alert" style="margin-top: 12px">
            <app-icon name="alert" [size]="16" />
            <span>The last payment failed. Update the card in <button type="button" class="link-btn" (click)="openPortal()">Manage billing</button> to keep your plan.</span>
          </div>
        }

        <!-- Usage -->
        <div class="meters">
          @for (m of meters(); track m.key) {
            <div class="meter {{ level(m) }}" [class.ai-unlimited]="m.key === 'ai' && m.limit === null">
              <div class="row meter-top">
                <app-icon [name]="m.icon" [size]="16" />
                <span class="strong small">{{ m.label }}</span>
                <span class="spacer"></span>
                <span class="tabular small">
                  @if (m.limit === null) {
                    {{ n(m.used) }} <span class="muted">· Unlimited</span>
                  } @else {
                    {{ n(m.used) }} / {{ n(m.limit) }} {{ m.unit }}
                  }
                </span>
              </div>
              <div class="bar" role="meter" [attr.aria-label]="m.label" [attr.aria-valuenow]="m.used" aria-valuemin="0" [attr.aria-valuemax]="m.limit ?? m.used">
                <span [style.width.%]="m.limit === null ? 100 : pct(m)" [class.unlimited]="m.limit === null"></span>
              </div>
              @if (m.key === 'ai' && m.limit === null) {
                <span class="tiny ai-badge"><app-icon name="sparkles" [size]="12" /> Unlimited AI tokens</span>
              } @else if (level(m) === 'full') {
                <span class="tiny danger-text">Limit reached{{ m.key === 'ai' ? ' — AI features are paused until next month or an upgrade' : '' }}</span>
              } @else if (level(m) === 'near') {
                <span class="tiny warning-text">Almost at the limit</span>
              }
            </div>
          }
        </div>

        <!-- Plans -->
        @if (!b.billing_enabled) {
          <p class="muted tiny quiet">Online billing isn't set up on this installation. Contact support to change your plan.</p>
        } @else if (plans().length) {
          <h3 class="plans-h">{{ b.plan ? 'Change plan' : 'Upgrade' }}</h3>
          <div class="plans">
            @for (p of plans(); track p.id) {
              <article class="plan" [class.current-plan]="p.id === b.plan?.id" [class.ai-plan]="p.ai_monthly_tokens === null">
                <div class="row-wrap">
                  <strong>{{ p.name }}</strong>
                  @if (p.ai_monthly_tokens === null) {
                    <span class="chip coral"><app-icon name="sparkles" [size]="11" /> Unlimited AI</span>
                  }
                </div>
                @if (p.price_label) {
                  <div class="price">{{ p.price_label }}</div>
                }
                @if (p.description) {
                  <p class="muted small">{{ p.description }}</p>
                }
                <ul class="list-reset limits small">
                  <li><app-icon name="layers" [size]="13" /> {{ lim(p.max_workspaces, 'workspaces') }}</li>
                  <li><app-icon name="channels" [size]="13" /> {{ lim(p.max_channels, 'channels') }}</li>
                  <li><app-icon name="users" [size]="13" /> {{ lim(p.max_members, 'people') }}</li>
                  <li><app-icon name="sparkles" [size]="13" /> {{ p.ai_monthly_tokens === null ? 'Unlimited AI tokens' : n(p.ai_monthly_tokens) + ' AI tokens / month' }}</li>
                </ul>
                <span class="spacer"></span>
                @if (p.id === b.plan?.id && b.status !== 'canceled') {
                  <span class="chip success block-chip"><app-icon name="check" [size]="12" /> Current plan</span>
                } @else if (!p.purchasable) {
                  <span class="muted tiny">Not available for online purchase</span>
                } @else {
                  <button type="button" class="btn primary sm" (click)="choose(p)" [disabled]="!!busy()">
                    @if (busy() === 'plan-' + p.id) {
                      <span class="spinner"></span>
                    }
                    Choose
                  </button>
                }
              </article>
            }
          </div>
          @if (b.has_billing_account && b.plan) {
            <p class="muted tiny" style="margin-top: 10px">To switch or cancel an existing subscription, invoices and card details, use Manage billing.</p>
          }
        } @else {
          <p class="muted tiny quiet">No plans are offered yet.</p>
        }
      }
    </section>
  `,
  styles: `
    .billing {
      scroll-margin-top: calc(var(--topbar-h) + 16px);
    }
    .current {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .plan-mark {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      flex: none;
    }
    .plan-name {
      font-size: 1.15rem;
    }
    .meters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 20px;
      margin-top: 18px;
    }
    @media (max-width: 640px) {
      .meters {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .meter {
      display: flex;
      flex-direction: column;
      gap: 6px;
      --meter: var(--accent);
    }
    .meter.near {
      --meter: var(--warning);
    }
    .meter.full {
      --meter: var(--danger);
    }
    .meter.ai-unlimited {
      --meter: var(--coral);
    }
    .meter-top {
      gap: 6px;
    }
    .bar {
      height: 8px;
      border-radius: 4px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--meter);
    }
    .bar span.unlimited {
      opacity: 0.35;
      background: repeating-linear-gradient(45deg, var(--meter), var(--meter) 6px, transparent 6px, transparent 10px);
    }
    .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--coral);
      font-weight: 700;
    }
    .quiet {
      margin-top: 16px;
    }
    .plans-h {
      margin: 22px 0 10px;
      font-size: 0.95rem;
    }
    .plans {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 12px;
    }
    .plan {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      border-radius: 14px;
      border: 1.5px solid var(--border);
      background: var(--surface-2);
    }
    .plan.current-plan {
      border-color: var(--success);
    }
    .plan.ai-plan {
      border-color: color-mix(in srgb, var(--coral) 55%, var(--border));
    }
    .price {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .limits {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--text-2);
    }
    .limits li {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .block-chip {
      align-self: flex-start;
    }
  `,
})
export class BillingCardComponent implements OnDestroy {
  readonly orgId = input.required<Id>();

  private readonly billingApi = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly external = inject(ExternalService);

  protected readonly billing = signal<OrgBilling | null>(null);
  protected readonly allPlans = signal<Plan[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly activating = signal(false);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly plans = computed(() => this.allPlans());
  protected readonly statusInfo = computed(() => {
    const s = this.billing()?.status;
    return s ? (STATUS[s] ?? { label: s, cls: '' }) : null;
  });
  protected readonly meters = computed<Meter[]>(() => {
    const b = this.billing();
    if (!b) return [];
    return [
      { key: 'workspaces', label: 'Active workspaces', icon: 'layers', used: b.usage.workspaces, limit: b.limits.max_workspaces, unit: 'workspaces' },
      { key: 'channels', label: 'Channels', icon: 'channels', used: b.usage.channels, limit: b.limits.max_channels, unit: 'channels' },
      { key: 'members', label: 'People', icon: 'users', used: b.usage.members, limit: b.limits.max_members, unit: 'people' },
      { key: 'ai', label: 'AI tokens this month', icon: 'sparkles', used: b.usage.ai_tokens_this_month, limit: b.limits.ai_monthly_tokens, unit: 'tokens' },
    ];
  });

  constructor() {
    effect(() => {
      const id = this.orgId();
      untracked(() => {
        this.load(id);
        this.handleReturn(id);
      });
    });
    this.billingApi.plans().subscribe({ next: (r) => this.allPlans.set(r.plans), error: () => undefined });
  }

  ngOnDestroy() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private load(id: Id, quiet = false) {
    if (!quiet) this.loading.set(true);
    this.billingApi.organization(id).subscribe({
      next: (b) => {
        this.billing.set(b);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (!quiet) this.error.set(formatError(err));
      },
    });
  }

  /** Handles ?billing=success|cancelled coming back from Stripe Checkout. */
  private handleReturn(id: Id) {
    const result = this.route.snapshot.queryParamMap.get('billing');
    if (!result) return;
    if (result === 'success') {
      this.toast.success('Payment received', 'Your new plan can take a few seconds to activate.');
      this.poll(id, 6);
    } else if (result === 'cancelled') {
      this.toast.info('Checkout cancelled', 'Nothing was charged.');
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: { billing: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Stripe webhooks arrive asynchronously: re-read billing a few times until the subscription changes. */
  private poll(id: Id, remaining: number, baseline?: string) {
    this.activating.set(true);
    this.billingApi.organization(id).subscribe({
      next: (b) => {
        this.billing.set(b);
        const key = `${b.plan?.id ?? ''}:${b.status}`;
        const live = !!b.plan && (b.status === 'active' || b.status === 'trialing');
        // First answer is the baseline; activation = an active plan that differs from it (or none before).
        const base = baseline ?? key;
        // Returning from a successful checkout: any active subscription that differs from the first answer
        // (or an active one right away) means the webhook has been processed.
        const done = live && (baseline === undefined || key !== base);
        if (done || remaining <= 1) {
          this.activating.set(false);
          if (done) this.toast.success('Plan active', `${b.plan?.name} is now active.`);
          return;
        }
        this.pollTimer = setTimeout(() => this.poll(id, remaining - 1, base), 3000);
      },
      error: () => this.activating.set(false),
    });
  }

  protected choose(p: Plan) {
    this.busy.set(`plan-${p.id}`);
    this.billingApi.checkout(this.orgId(), p.id).subscribe({
      next: ({ url }) => {
        void this.external.go(url, 'billing');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not start checkout', err);
      },
    });
  }

  protected openPortal() {
    this.busy.set('portal');
    this.billingApi.portal(this.orgId()).subscribe({
      next: ({ url }) => {
        void this.external.go(url, 'billing');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not open billing', err);
      },
    });
  }

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

  protected lim(v: number | null, unit: string) {
    return v === null ? `Unlimited ${unit}` : `${fmtNumber(v)} ${unit}`;
  }
}
