import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { fieldErrors, formatError } from '../../core/errors';
import { PlatformOrganization } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { MeterComponent } from './meter.component';
import { PlatformHeaderComponent } from './platform-header.component';
import { LIMIT_FIELDS, parseLimit } from './platform-utils';

const PAGE = 25;

@Component({
  selector: 'app-platform-organizations-page',
  imports: [FormsModule, RouterLink, PlatformHeaderComponent, MeterComponent, ModalComponent, IconComponent, EmptyStateComponent, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="Organizations" subtitle="Customers, their plan limits and what they use.">
        <button type="button" class="btn primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> New organization</button>
      </app-platform-header>

      <div class="row-wrap filters">
        <div class="search">
          <app-icon name="search" [size]="16" />
          <input class="input" type="search" placeholder="Search name, slug or member email" aria-label="Search organizations" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </div>
        <div class="segmented" role="group" aria-label="Status filter">
          <button type="button" [attr.aria-pressed]="status() === ''" (click)="setStatus('')">All</button>
          <button type="button" [attr.aria-pressed]="status() === 'active'" (click)="setStatus('active')">Active</button>
          <button type="button" [attr.aria-pressed]="status() === 'suspended'" (click)="setStatus('suspended')">Suspended</button>
        </div>
        <span class="spacer"></span>
        <span class="muted small">{{ count() }} {{ count() === 1 ? 'organization' : 'organizations' }}</span>
      </div>

      @if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      }

      <div class="card flush">
        @if (rows().length) {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Owners</th>
                  <th>Workspaces</th>
                  <th>Channels</th>
                  <th>Members</th>
                  <th>AI tokens</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                @for (o of rows(); track o.id) {
                  <tr class="click" (click)="open(o)">
                    <td>
                      <a [routerLink]="['/platform/organizations', o.id]" class="strong" (click)="$event.stopPropagation()">{{ o.name }}</a>
                      <div class="muted tiny mono">{{ o.slug }}</div>
                    </td>
                    <td>
                      <span class="chip" [class.success]="o.status === 'active'" [class.danger]="o.status === 'suspended'"><span class="dot"></span>{{ o.status }}</span>
                    </td>
                    <td class="small">
                      @for (e of o.owners; track e) {
                        <div class="truncate owner">{{ e }}</div>
                      } @empty {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td><app-meter [used]="o.usage.workspaces" [limit]="o.max_workspaces" /></td>
                    <td><app-meter [used]="o.usage.channels" [limit]="o.max_channels" /></td>
                    <td><app-meter [used]="o.usage.members" [limit]="o.max_members" /></td>
                    <td><app-meter [used]="o.usage.ai_tokens_this_month" [limit]="o.ai_monthly_tokens" /></td>
                    <td class="small muted">{{ o.created_at | tzDate: 'date' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pager">
            <button type="button" class="btn sm" (click)="go(-1)" [disabled]="offset() === 0 || loading()"><app-icon name="chevronLeft" [size]="14" /> Previous</button>
            <span class="muted small">{{ offset() + 1 }}–{{ offset() + rows().length }} of {{ count() }}</span>
            <button type="button" class="btn sm" (click)="go(1)" [disabled]="offset() + rows().length >= count() || loading()">Next <app-icon name="chevronRight" [size]="14" /></button>
          </div>
        } @else if (loading()) {
          <div style="padding: 20px" class="stack">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton" style="height: 36px"></div>
            }
          </div>
        } @else {
          <app-empty-state icon="layers" title="No organizations found" [text]="search() || status() ? 'Try a different search or filter.' : 'Create the first organization to onboard a customer.'" />
        }
      </div>
    </div>

    <app-modal [open]="createOpen()" title="New organization" subtitle="Set up a customer account with its plan limits." size="lg" [dismissible]="!saving()" (closed)="createOpen.set(false)">
      <form id="new-org" class="stack" (ngSubmit)="create()">
        <div class="form-grid">
          <div class="field">
            <label for="o-name">Name</label>
            <input id="o-name" name="name" class="input" [(ngModel)]="name" [class.invalid]="fe()['name']" required />
            @if (fe()['name']) {
              <span class="error">{{ fe()['name'] }}</span>
            }
          </div>
          <div class="field">
            <label for="o-owner">Owner email</label>
            <input id="o-owner" name="owner" type="email" class="input" [(ngModel)]="ownerEmail" [class.invalid]="fe()['owner_email']" placeholder="owner@customer.com" />
            @if (fe()['owner_email']) {
              <span class="error">{{ fe()['owner_email'] }}</span>
            } @else {
              <span class="hint">An existing user becomes owner right away; otherwise an owner invitation is created (copy its link from the organization page).</span>
            }
          </div>
        </div>
        <fieldset class="limits">
          <legend>Plan limits <span class="muted">(leave blank for unlimited)</span></legend>
          <div class="form-grid">
            @for (f of limitFields; track f.key) {
              <div class="field">
                <label [for]="'l-' + f.key">{{ f.label }}</label>
                <input [id]="'l-' + f.key" [name]="f.key" type="number" min="0" class="input" placeholder="Unlimited" [ngModel]="limits()[f.key]" (ngModelChange)="setLimit(f.key, $event)" />
                @if (fe()[f.key]) {
                  <span class="error">{{ fe()[f.key] }}</span>
                }
              </div>
            }
          </div>
        </fieldset>
        <div class="field">
          <label for="o-notes">Internal notes</label>
          <textarea id="o-notes" name="notes" class="textarea" rows="2" [(ngModel)]="notes" placeholder="Contract, contacts, billing… (only superadmins see this)"></textarea>
        </div>
        @if (general()) {
          <div class="form-error" role="alert">{{ general() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="createOpen.set(false)">Cancel</button>
        <button type="submit" form="new-org" class="btn primary" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          Create organization
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .filters {
      margin-bottom: 14px;
    }
    .search {
      position: relative;
      flex: 1;
      max-width: 380px;
      min-width: 220px;
    }
    .search app-icon {
      position: absolute;
      left: 12px;
      top: 12px;
      color: var(--muted);
    }
    .search .input {
      padding-left: 36px;
    }
    tr.click {
      cursor: pointer;
    }
    .owner {
      max-width: 200px;
    }
    .pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-top: 1px solid var(--border);
    }
    .limits {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px 14px;
      margin: 0;
    }
    .limits legend {
      font-size: 0.8rem;
      font-weight: 700;
      padding: 0 6px;
    }
  `,
})
export class PlatformOrganizationsPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  protected readonly rows = signal<PlatformOrganization[]>([]);
  protected readonly count = signal(0);
  protected readonly offset = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly search = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly status = signal(this.route.snapshot.queryParamMap.get('status') ?? '');

  protected readonly limitFields = LIMIT_FIELDS;
  protected readonly createOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly name = signal('');
  protected readonly ownerEmail = signal('');
  protected readonly notes = signal('');
  protected readonly limits = signal<Record<string, string>>({});
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');

  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  protected onSearch(v: string) {
    this.search.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.offset.set(0);
      this.load();
    }, 300);
  }

  protected setStatus(s: string) {
    this.status.set(s);
    this.offset.set(0);
    this.load();
  }

  protected go(dir: number) {
    this.offset.set(Math.max(0, this.offset() + dir * PAGE));
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api
      .page<PlatformOrganization>('platform/organizations/', {
        search: this.search().trim(),
        status: this.status(),
        limit: PAGE,
        offset: this.offset(),
      })
      .subscribe({
        next: (p) => {
          this.rows.set(p.results);
          this.count.set(p.count);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(formatError(err));
          this.loading.set(false);
        },
      });
  }

  protected open(o: PlatformOrganization) {
    this.router.navigate(['/platform/organizations', o.id]);
  }

  protected openCreate() {
    this.name.set('');
    this.ownerEmail.set('');
    this.notes.set('');
    this.limits.set({});
    this.fe.set({});
    this.general.set('');
    this.createOpen.set(true);
  }

  protected setLimit(key: string, value: string | number | null) {
    this.limits.update((l) => ({ ...l, [key]: value === null || value === undefined ? '' : String(value) }));
  }

  protected create() {
    if (!this.name().trim()) {
      this.fe.set({ name: 'Give the organization a name.' });
      return;
    }
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    const body: Record<string, unknown> = { name: this.name().trim(), notes: this.notes() };
    if (this.ownerEmail().trim()) body['owner_email'] = this.ownerEmail().trim();
    for (const f of LIMIT_FIELDS) body[f.key] = parseLimit(this.limits()[f.key]);
    this.api.post<PlatformOrganization>('platform/organizations/', body).subscribe({
      next: (o) => {
        this.saving.set(false);
        this.createOpen.set(false);
        this.toast.success('Organization created', o.owners.length ? `Owner: ${o.owners.join(', ')}` : body['owner_email'] ? 'An owner invitation was created.' : undefined);
        this.router.navigate(['/platform/organizations', o.id]);
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        const known = ['name', 'owner_email', ...LIMIT_FIELDS.map((f) => f.key)];
        const other = Object.entries(fields)
          .filter(([k]) => !known.includes(k))
          .map(([k, v]) => `${k}: ${v}`);
        this.general.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }
}
