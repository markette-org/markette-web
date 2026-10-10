import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BillingService } from '../../core/billing.service';
import { fieldErrors, formatError } from '../../core/errors';
import { Id, PlatformPlan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { PlatformHeaderComponent } from './platform-header.component';
import { LIMIT_FIELDS, LimitKey } from './platform-utils';

interface PlanDraft {
  name: string;
  slug: string;
  description: string;
  price_label: string;
  stripe_price_id: string;
  is_public: boolean;
  active: boolean;
  sort: number;
  limits: Record<LimitKey, { value: string; unlimited: boolean }>;
}

const CURRENCIES = ['eur', 'usd', 'gbp', 'chf'];

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function emptyLimits(): PlanDraft['limits'] {
  return {
    max_workspaces: { value: '', unlimited: true },
    max_channels: { value: '', unlimited: true },
    max_members: { value: '', unlimited: true },
    ai_monthly_tokens: { value: '', unlimited: true },
  };
}

@Component({
  selector: 'app-platform-plans-page',
  imports: [FormsModule, RouterLink, PlatformHeaderComponent, IconComponent, ModalComponent, EmptyStateComponent, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="Plans" subtitle="Subscription plans sold through Stripe. Null limits mean unlimited.">
        <button type="button" class="btn" (click)="openPreset()"><app-icon name="sparkles" [size]="16" /> Unlimited AI preset</button>
        <button type="button" class="btn primary" (click)="openNew()"><app-icon name="plus" [size]="16" /> New plan</button>
      </app-platform-header>

      @if (loadError()) {
        <div class="form-error" role="alert">{{ loadError() }}</div>
      }

      @if (loading()) {
        <div class="skeleton" style="height: 220px"></div>
      } @else if (!plans().length) {
        <div class="card">
          <app-empty-state
            icon="tag"
            title="No plans yet"
            text="Plans set the limits an organization gets when it subscribes. Add your Stripe keys in Platform → Settings → Billing, create a plan here, then create its Stripe price to make it purchasable."
          >
            <a routerLink="/platform/settings" fragment="billing" class="btn">Billing settings</a>
            <button type="button" class="btn primary" (click)="openNew()"><app-icon name="plus" [size]="16" /> New plan</button>
          </app-empty-state>
        </div>
      } @else {
        <div class="card flush table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Limits</th>
                <th>Stripe</th>
                <th>Visibility</th>
                <th class="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr [class.inactive]="!p.active">
                  <td>
                    <div class="strong">{{ p.name }}</div>
                    <div class="muted tiny mono">{{ p.slug }} · sort {{ p.sort }}</div>
                    @if (p.description) {
                      <div class="muted small clamp-2 desc">{{ p.description }}</div>
                    }
                  </td>
                  <td>{{ p.price_label || '—' }}</td>
                  <td>
                    <div class="limits">
                      @for (f of limitFields; track f.key) {
                        @if (f.key === 'ai_monthly_tokens' && p.ai_monthly_tokens === null) {
                          <span class="chip accent strong"><app-icon name="sparkles" [size]="12" /> Unlimited AI</span>
                        } @else {
                          <span class="lim"><span class="muted">{{ f.label }}</span> {{ p[f.key] === null ? 'Unlimited' : (p[f.key] | num) }}</span>
                        }
                      }
                    </div>
                  </td>
                  <td>
                    @if (p.stripe_price_id) {
                      <span class="chip success" [title]="p.stripe_price_id"><app-icon name="check" [size]="12" /> Stripe price set</span>
                      <div class="mono tiny muted price-id">{{ p.stripe_price_id }}</div>
                    } @else {
                      <span class="chip warning"><app-icon name="alert" [size]="12" /> No Stripe price — not purchasable</span>
                    }
                  </td>
                  <td>
                    <div class="row-wrap">
                      <button type="button" class="chip" [class.info]="p.is_public" [class.outline]="!p.is_public" (click)="toggle(p, 'is_public')" [disabled]="busy() === p.id" [title]="p.is_public ? 'Listed to organizations — click to hide' : 'Hidden — click to list'">
                        {{ p.is_public ? 'Public' : 'Hidden' }}
                      </button>
                      <button type="button" class="chip" [class.success]="p.active" [class.outline]="!p.active" (click)="toggle(p, 'active')" [disabled]="busy() === p.id" [title]="p.active ? 'Active — click to deactivate' : 'Inactive — click to activate'">
                        {{ p.active ? 'Active' : 'Inactive' }}
                      </button>
                    </div>
                  </td>
                  <td class="num">
                    <div class="row actions">
                      <button type="button" class="btn sm" (click)="openEdit(p)"><app-icon name="edit" [size]="14" /> Edit</button>
                      <button type="button" class="btn sm" (click)="openPrice(p)"><app-icon name="tag" [size]="14" /> {{ p.stripe_price_id ? 'New Stripe price' : 'Create Stripe price' }}</button>
                      <button type="button" class="btn sm danger-ghost icon" (click)="remove(p)" [attr.aria-label]="'Delete ' + p.name"><app-icon name="trash" [size]="14" /></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Create / edit -->
    <app-modal [open]="editOpen()" [title]="editing() ? 'Edit ' + editing()!.name : 'New plan'" size="lg" (closed)="editOpen.set(false)" [dismissible]="!saving()">
      @if (draft(); as d) {
        <form id="plan-form" class="stack" (ngSubmit)="savePlan()" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="pl-name">Name</label>
              <input id="pl-name" name="name" class="input" [class.invalid]="fe()['name']" [ngModel]="d.name" (ngModelChange)="setName($event)" required />
              @if (fe()['name']) {
                <span class="error">{{ fe()['name'] }}</span>
              }
            </div>
            <div class="field">
              <label for="pl-slug">Slug</label>
              <input id="pl-slug" name="slug" class="input mono-in" [class.invalid]="fe()['slug']" [ngModel]="d.slug" (ngModelChange)="setSlug($event)" />
              @if (fe()['slug']) {
                <span class="error">{{ fe()['slug'] }}</span>
              } @else {
                <span class="hint">Unique identifier, generated from the name.</span>
              }
            </div>
            <div class="field full">
              <label for="pl-desc">Description</label>
              <textarea id="pl-desc" name="desc" class="textarea" rows="2" [ngModel]="d.description" (ngModelChange)="patch({ description: $event })"></textarea>
            </div>
            <div class="field">
              <label for="pl-price">Price label</label>
              <input id="pl-price" name="price" class="input" [ngModel]="d.price_label" (ngModelChange)="patch({ price_label: $event })" placeholder="€29 / month" />
              <span class="hint">Display only; Stripe's price is what is charged.</span>
            </div>
            <div class="field">
              <label for="pl-sort">Sort order</label>
              <input id="pl-sort" name="sort" type="number" min="0" class="input" [ngModel]="d.sort" (ngModelChange)="patch({ sort: +$event || 0 })" />
            </div>
          </div>

          <fieldset class="limits-set">
            <legend>Limits</legend>
            <div class="form-grid">
              @for (f of limitFields; track f.key) {
                <div class="field">
                  <label [for]="'pl-' + f.key">{{ f.label }}</label>
                  <div class="row">
                    <input
                      [id]="'pl-' + f.key"
                      [name]="f.key"
                      type="number"
                      min="0"
                      class="input"
                      [class.invalid]="fe()[f.key]"
                      [disabled]="d.limits[f.key].unlimited"
                      [ngModel]="d.limits[f.key].value"
                      (ngModelChange)="setLimit(f.key, { value: $event === null ? '' : '' + $event })"
                      [placeholder]="d.limits[f.key].unlimited ? '∞' : '0'"
                    />
                    <label class="checkbox nowrap">
                      <input type="checkbox" [checked]="d.limits[f.key].unlimited" (change)="setLimit(f.key, { unlimited: $any($event.target).checked })" />
                      Unlimited
                    </label>
                  </div>
                  @if (fe()[f.key]) {
                    <span class="error">{{ fe()[f.key] }}</span>
                  }
                </div>
              }
            </div>
          </fieldset>

          <div class="row-wrap">
            <label class="switch">
              <input type="checkbox" name="public" [checked]="d.is_public" (change)="patch({ is_public: $any($event.target).checked })" />
              <span class="track"></span> Public (listed to organizations)
            </label>
            <label class="switch">
              <input type="checkbox" name="active" [checked]="d.active" (change)="patch({ active: $any($event.target).checked })" />
              <span class="track"></span> Active
            </label>
          </div>

          <details class="advanced" [open]="!!d.stripe_price_id">
            <summary>Advanced: Stripe price id</summary>
            <div class="field" style="margin-top: 10px">
              <label for="pl-stripe">Stripe price id</label>
              <input id="pl-stripe" name="stripe" class="input mono-in" [ngModel]="d.stripe_price_id" (ngModelChange)="patch({ stripe_price_id: $event })" placeholder="price_…" />
              <span class="hint">Usually set with "Create Stripe price". Paste an existing price id to reuse one.</span>
            </div>
          </details>

          @if (formError()) {
            <div class="form-error" role="alert">{{ formError() }}</div>
          }
        </form>
      }
      <div modal-footer>
        <button type="button" class="btn" (click)="editOpen.set(false)" [disabled]="saving()">Cancel</button>
        <button type="submit" form="plan-form" class="btn primary" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          {{ editing() ? 'Save plan' : 'Create plan' }}
        </button>
      </div>
    </app-modal>

    <!-- Stripe price -->
    <app-modal [open]="!!pricePlan()" [title]="'Stripe price for ' + (pricePlan()?.name ?? '')" subtitle="Creates the Stripe product and a recurring price, then stores its id on the plan." size="sm" (closed)="pricePlan.set(null)" [dismissible]="!pricing()">
      <form id="price-form" class="stack" (ngSubmit)="createPrice()" novalidate>
        @if (pricePlan()?.stripe_price_id) {
          <div class="notice warning small">
            <app-icon name="alert" [size]="16" />
            <span>This plan already has a price ({{ pricePlan()?.stripe_price_id }}). A new one replaces it for future checkouts; existing subscriptions keep the old price.</span>
          </div>
        }
        <div class="row">
          <div class="field" style="flex: 1">
            <label for="pr-amount">Amount</label>
            <input id="pr-amount" name="amount" type="number" min="0" step="0.01" class="input" [ngModel]="amount()" (ngModelChange)="amount.set($event)" placeholder="29.00" />
          </div>
          <div class="field" style="width: 110px">
            <label for="pr-cur">Currency</label>
            <select id="pr-cur" name="cur" class="select" [ngModel]="currency()" (ngModelChange)="currency.set($event)">
              @for (c of currencies; track c) {
                <option [value]="c">{{ c.toUpperCase() }}</option>
              }
            </select>
          </div>
        </div>
        <div class="field">
          <span class="label" id="pr-int-label">Billing interval</span>
          <div class="segmented" role="radiogroup" aria-labelledby="pr-int-label">
            <button type="button" role="radio" [attr.aria-checked]="interval() === 'month'" [class.active]="interval() === 'month'" (click)="interval.set('month')">Monthly</button>
            <button type="button" role="radio" [attr.aria-checked]="interval() === 'year'" [class.active]="interval() === 'year'" (click)="interval.set('year')">Yearly</button>
          </div>
        </div>
        @if (centsPreview() !== null) {
          <p class="muted small">Stripe will charge {{ centsPreview() }} cents ({{ currency().toUpperCase() }}) every {{ interval() }}.</p>
        }
        @if (priceError()) {
          <div class="form-error" role="alert">{{ priceError() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="pricePlan.set(null)" [disabled]="pricing()">Cancel</button>
        <button type="submit" form="price-form" class="btn primary" [disabled]="pricing()">
          @if (pricing()) {
            <span class="spinner"></span>
          }
          Create Stripe price
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    tr.inactive td {
      opacity: 0.6;
    }
    .desc {
      max-width: 320px;
      margin-top: 2px;
    }
    .limits {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.82rem;
      align-items: flex-start;
    }
    .lim .muted {
      margin-right: 4px;
    }
    .price-id {
      margin-top: 4px;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions {
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .mono-in {
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }
    .nowrap {
      white-space: nowrap;
    }
    .limits-set {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px 14px;
      margin: 0;
    }
    .limits-set legend {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 0 6px;
    }
    .advanced summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 0.88rem;
      color: var(--text-2);
    }
  `,
})
export class PlatformPlansPage implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly limitFields = LIMIT_FIELDS;
  protected readonly currencies = CURRENCIES;

  protected readonly raw = signal<PlatformPlan[]>([]);
  protected readonly plans = computed(() => [...this.raw()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)));
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal<Id | null>(null);

  /* edit dialog */
  protected readonly editOpen = signal(false);
  protected readonly editing = signal<PlatformPlan | null>(null);
  protected readonly draft = signal<PlanDraft | null>(null);
  private slugTouched = false;
  protected readonly saving = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly formError = signal('');

  /* stripe price dialog */
  protected readonly pricePlan = signal<PlatformPlan | null>(null);
  protected readonly amount = signal<number | string | null>(null);
  protected readonly currency = signal('eur');
  protected readonly interval = signal<'month' | 'year'>('month');
  protected readonly pricing = signal(false);
  protected readonly priceError = signal('');
  protected readonly centsPreview = computed(() => {
    const n = Number(this.amount());
    return this.amount() !== null && this.amount() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  });

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.billing.platformPlans().subscribe({
      next: (list) => {
        this.raw.set(Array.isArray(list) ? list : ((list as { results?: PlatformPlan[] }).results ?? []));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  private upsert(p: PlatformPlan) {
    this.raw.update((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
  }

  /* --- dialog ---------------------------------------------------------------------- */

  private openWith(d: PlanDraft, plan: PlatformPlan | null) {
    this.editing.set(plan);
    this.draft.set(d);
    this.slugTouched = !!plan;
    this.fe.set({});
    this.formError.set('');
    this.editOpen.set(true);
  }

  protected openNew() {
    const nextSort = Math.max(0, ...this.raw().map((p) => p.sort)) + 10;
    this.openWith(
      { name: '', slug: '', description: '', price_label: '', stripe_price_id: '', is_public: true, active: true, sort: nextSort, limits: emptyLimits() },
      null,
    );
  }

  protected openPreset() {
    const nextSort = Math.max(0, ...this.raw().map((p) => p.sort)) + 10;
    this.openWith(
      {
        name: 'Unlimited AI',
        slug: 'unlimited-ai',
        description: 'Generous limits and unlimited AI assistance.',
        price_label: '',
        stripe_price_id: '',
        is_public: true,
        active: true,
        sort: nextSort,
        limits: {
          max_workspaces: { value: '10', unlimited: false },
          max_channels: { value: '50', unlimited: false },
          max_members: { value: '25', unlimited: false },
          ai_monthly_tokens: { value: '', unlimited: true },
        },
      },
      null,
    );
    this.slugTouched = true;
  }

  protected openEdit(p: PlatformPlan) {
    const limits = emptyLimits();
    for (const f of LIMIT_FIELDS) {
      const v = p[f.key];
      limits[f.key] = { value: v === null ? '' : String(v), unlimited: v === null };
    }
    this.openWith(
      {
        name: p.name,
        slug: p.slug,
        description: p.description,
        price_label: p.price_label,
        stripe_price_id: p.stripe_price_id,
        is_public: p.is_public,
        active: p.active,
        sort: p.sort,
        limits,
      },
      p,
    );
  }

  protected patch(p: Partial<PlanDraft>) {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  protected setName(v: string) {
    this.patch(this.slugTouched ? { name: v } : { name: v, slug: slugify(v) });
  }

  protected setSlug(v: string) {
    this.slugTouched = true;
    this.patch({ slug: v });
  }

  protected setLimit(key: LimitKey, p: Partial<{ value: string; unlimited: boolean }>) {
    this.draft.update((d) => (d ? { ...d, limits: { ...d.limits, [key]: { ...d.limits[key], ...p } } } : d));
  }

  protected savePlan() {
    const d = this.draft();
    if (!d) return;
    const errors: Record<string, string> = {};
    if (!d.name.trim()) errors['name'] = 'Required.';
    if (!d.slug.trim()) errors['slug'] = 'Required.';
    const body: Partial<PlatformPlan> = {
      name: d.name.trim(),
      slug: d.slug.trim(),
      description: d.description,
      price_label: d.price_label.trim(),
      stripe_price_id: d.stripe_price_id.trim(),
      is_public: d.is_public,
      active: d.active,
      sort: d.sort,
    };
    for (const f of LIMIT_FIELDS) {
      const l = d.limits[f.key];
      if (l.unlimited) body[f.key] = null;
      else {
        const n = Math.floor(Number(l.value));
        if (l.value.trim() === '' || !Number.isFinite(n) || n < 0) errors[f.key] = 'A whole number, or tick Unlimited.';
        else body[f.key] = n;
      }
    }
    if (Object.keys(errors).length) {
      this.fe.set(errors);
      return;
    }
    this.saving.set(true);
    this.fe.set({});
    this.formError.set('');
    const existing = this.editing();
    const req = existing ? this.billing.updatePlan(existing.id, body) : this.billing.createPlan(body);
    req.subscribe({
      next: (p) => {
        this.saving.set(false);
        this.upsert(p);
        this.editOpen.set(false);
        this.toast.success(existing ? 'Plan saved' : 'Plan created', p.stripe_price_id ? undefined : 'Create its Stripe price to make it purchasable.');
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        const known = new Set(['name', 'slug', ...LIMIT_FIELDS.map((f) => f.key)]);
        const other = Object.entries(fields)
          .filter(([k]) => !known.has(k))
          .map(([k, v]) => `${k}: ${v}`);
        this.formError.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }

  /* --- row actions ------------------------------------------------------------------- */

  protected toggle(p: PlatformPlan, key: 'active' | 'is_public') {
    this.busy.set(p.id);
    this.billing.updatePlan(p.id, { [key]: !p[key] }).subscribe({
      next: (u) => {
        this.busy.set(null);
        this.upsert(u);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not update the plan', err);
      },
    });
  }

  protected async remove(p: PlatformPlan) {
    const ok = await this.confirm.ask({
      title: `Delete ${p.name}?`,
      message:
        'The plan disappears from the plan list and can no longer be purchased. Organizations already on this plan keep their current limits. The Stripe product and price are not deleted.',
      confirmLabel: 'Delete plan',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(p.id);
    this.billing.deletePlan(p.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.raw.update((list) => list.filter((x) => x.id !== p.id));
        this.toast.success('Plan deleted');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not delete the plan', err);
      },
    });
  }

  protected openPrice(p: PlatformPlan) {
    this.amount.set(null);
    this.currency.set('eur');
    this.interval.set('month');
    this.priceError.set('');
    this.pricePlan.set(p);
  }

  protected createPrice() {
    const p = this.pricePlan();
    const cents = this.centsPreview();
    if (!p) return;
    if (cents === null || cents <= 0) {
      this.priceError.set('Enter an amount greater than zero, e.g. 29.00.');
      return;
    }
    this.pricing.set(true);
    this.priceError.set('');
    this.billing.createStripePrice(p.id, { amount_cents: cents, currency: this.currency(), interval: this.interval() }).subscribe({
      next: (u) => {
        this.pricing.set(false);
        this.upsert(u);
        this.pricePlan.set(null);
        this.toast.success('Stripe price created', `${u.name} is now purchasable (${u.stripe_price_id}).`);
      },
      error: (err) => {
        this.pricing.set(false);
        this.priceError.set(formatError(err));
      },
    });
  }
}
