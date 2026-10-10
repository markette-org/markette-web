import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { fieldErrors, formatError } from '../../core/errors';
import { PlatformOrganization, PlatformOrganizationDetail } from '../../core/models';
import { inviteLink } from '../../core/organization.service';
import { ToastService } from '../../core/toast.service';
import { browserTimezone } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { allTimezones } from '../../shared/utils/dates';
import { MeterComponent } from './meter.component';
import { PlatformHeaderComponent } from './platform-header.component';
import { LIMIT_FIELDS, LimitKey, copyText, limitToInput, parseLimit } from './platform-utils';

@Component({
  selector: 'app-platform-organization-detail-page',
  imports: [FormsModule, RouterLink, PlatformHeaderComponent, MeterComponent, ModalComponent, IconComponent, EmptyStateComponent, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header [title]="org()?.name || 'Organization'" [subtitle]="org() ? org()!.slug : ''">
        <a routerLink="/platform/organizations" class="btn ghost"><app-icon name="arrowLeft" [size]="16" /> All organizations</a>
        @if (org(); as o) {
          @if (o.status === 'suspended') {
            <button type="button" class="btn primary" (click)="setStatus('active')" [disabled]="busy()"><app-icon name="check" [size]="16" /> Reactivate</button>
          } @else {
            <button type="button" class="btn danger-ghost" (click)="setStatus('suspended')" [disabled]="busy()"><app-icon name="pause" [size]="16" /> Suspend</button>
          }
        }
      </app-platform-header>

      @if (error()) {
        <div class="card"><app-empty-state icon="alert" title="Could not load this organization" [text]="error()"><a routerLink="/platform/organizations" class="btn">Back</a></app-empty-state></div>
      } @else if (org(); as o) {
        @if (o.status === 'suspended') {
          <div class="notice danger" style="margin-bottom: 16px" role="status">
            <app-icon name="lock" [size]="18" />
            <span><strong>Suspended.</strong> Its members get a "suspended" screen, every tenant API call returns 403 and nothing is published until you reactivate it.</span>
          </div>
        }

        <div class="grid grid-4" style="margin-bottom: 16px">
          <div class="card tight"><app-meter label="Workspaces" [used]="o.usage.workspaces" [limit]="o.max_workspaces" /></div>
          <div class="card tight"><app-meter label="Channels" [used]="o.usage.channels" [limit]="o.max_channels" /></div>
          <div class="card tight"><app-meter label="Members" [used]="o.usage.members" [limit]="o.max_members" /></div>
          <div class="card tight"><app-meter label="AI tokens this month" [used]="o.usage.ai_tokens_this_month" [limit]="o.ai_monthly_tokens" /></div>
        </div>

        <div class="layout">
          <section class="card">
            <div class="card-head">
              <h2>Account & limits</h2>
              <span class="chip" [class.success]="o.status === 'active'" [class.danger]="o.status === 'suspended'"><span class="dot"></span>{{ o.status }}</span>
            </div>
            <form class="stack" (ngSubmit)="save()">
              <div class="field">
                <label for="d-name">Name</label>
                <input id="d-name" name="name" class="input" [(ngModel)]="name" />
                @if (fe()['name']) {
                  <span class="error">{{ fe()['name'] }}</span>
                }
              </div>
              <div class="form-grid">
                @for (f of limitFields; track f.key) {
                  <div class="field">
                    <label [for]="'d-' + f.key">{{ f.label }}</label>
                    <input [id]="'d-' + f.key" [name]="f.key" type="number" min="0" class="input" placeholder="Unlimited" [ngModel]="limits()[f.key]" (ngModelChange)="setLimit(f.key, $event)" />
                    @if (fe()[f.key]) {
                      <span class="error">{{ fe()[f.key] }}</span>
                    }
                  </div>
                }
              </div>
              <span class="hint">Leave a limit blank for unlimited. Lowering a limit below current usage blocks new additions; nothing is removed.</span>
              <div class="field">
                <label for="d-notes">Internal notes</label>
                <textarea id="d-notes" name="notes" class="textarea" rows="3" [(ngModel)]="notes"></textarea>
              </div>
              @if (general()) {
                <div class="form-error" role="alert">{{ general() }}</div>
              }
              <div class="row">
                <button type="submit" class="btn primary" [disabled]="busy()">
                  @if (saving()) {
                    <span class="spinner"></span>
                  }
                  Save changes
                </button>
                <span class="spacer"></span>
                <button type="button" class="btn danger-ghost" (click)="remove()" [disabled]="busy()"><app-icon name="trash" [size]="16" /> Delete organization</button>
              </div>
            </form>
          </section>

          <div class="stack">
            <section class="card">
              <div class="card-head"><h2>Owners</h2></div>
              @for (e of o.owners; track e) {
                <div class="row small"><app-icon name="user" [size]="14" /> {{ e }}</div>
              } @empty {
                <p class="muted small">No owner yet{{ o.invitations.length ? ' — an invitation is pending below.' : '.' }}</p>
              }
              <p class="muted tiny" style="margin-top: 10px">Created {{ o.created_at | tzDate: 'date' }}</p>
            </section>
          </div>
        </div>

        <section class="card flush section">
          <div class="card-head pad">
            <h2>Workspaces <span class="muted small">({{ o.workspaces.length }})</span></h2>
            <button type="button" class="btn sm" (click)="openAddWs()"><app-icon name="plus" [size]="14" /> Add workspace</button>
          </div>
          @if (o.workspaces.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Name</th><th>Slug</th><th>Time zone</th><th class="num">Channels</th><th class="num">Members</th><th>Created</th></tr>
                </thead>
                <tbody>
                  @for (w of o.workspaces; track w.id) {
                    <tr>
                      <td class="strong">{{ w.name }} @if (w.archived_at) {<span class="chip outline">Archived</span>}</td>
                      <td class="mono small">{{ w.slug }}</td>
                      <td class="small">{{ w.timezone }}</td>
                      <td class="num">{{ w.channels }}</td>
                      <td class="num">{{ w.members }}</td>
                      <td class="small muted">{{ w.created_at | tzDate: 'date' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="muted small pad">No workspaces yet.</p>
          }
        </section>

        <section class="card flush section">
          <div class="card-head pad"><h2>Members <span class="muted small">({{ o.members.length }})</span></h2></div>
          @if (o.members.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Email</th><th>Name</th><th>Role</th><th></th></tr>
                </thead>
                <tbody>
                  @for (m of o.members; track m.id) {
                    <tr>
                      <td>
                        <a routerLink="/platform/users" [queryParams]="{ search: m.email }">{{ m.email }}</a>
                        @if (!m.is_active) {
                          <span class="chip danger">Inactive</span>
                        }
                      </td>
                      <td>{{ m.name || '—' }}</td>
                      <td><span class="chip" [class.accent]="m.role !== 'member'">{{ m.role }}</span></td>
                      <td class="num"><a routerLink="/platform/users" [queryParams]="{ search: m.email }" class="small">Open user</a></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="muted small pad">No members yet.</p>
          }
        </section>

        <section class="card flush section">
          <div class="card-head pad"><h2>Pending invitations <span class="muted small">({{ o.invitations.length }})</span></h2></div>
          @if (o.invitations.length) {
            <ul class="list-reset invites">
              @for (i of o.invitations; track i.id) {
                <li>
                  <div class="stack-sm" style="min-width: 0; flex: 1">
                    <span class="strong">{{ i.email }}</span>
                    <span class="muted tiny">{{ i.org_role ? 'Organization ' + i.org_role : 'Workspace ' + i.role }} · invited {{ i.created_at | tzDate: 'date' }}</span>
                    <code class="link truncate">{{ link(i.token, i.email) }}</code>
                  </div>
                  <button type="button" class="btn sm" (click)="copy(link(i.token, i.email))"><app-icon name="copy" [size]="14" /> Copy link</button>
                </li>
              }
            </ul>
          } @else {
            <p class="muted small pad">No pending invitations.</p>
          }
        </section>
      } @else {
        <div class="stack">
          <div class="skeleton" style="height: 80px"></div>
          <div class="skeleton" style="height: 260px"></div>
        </div>
      }
    </div>

    <app-modal [open]="wsOpen()" title="Add workspace" size="sm" [dismissible]="!wsSaving()" (closed)="wsOpen.set(false)">
      <form id="add-ws" class="stack" (ngSubmit)="addWs()">
        <div class="field">
          <label for="w-name">Name</label>
          <input id="w-name" name="wname" class="input" [(ngModel)]="wsName" required />
        </div>
        <div class="field">
          <label for="w-tz">Time zone</label>
          <select id="w-tz" name="wtz" class="select" [(ngModel)]="wsTz">
            @for (tz of timezones; track tz) {
              <option [value]="tz">{{ tz }}</option>
            }
          </select>
        </div>
        <span class="hint">Created directly by the platform, bypassing the plan's workspace limit. Org owners and admins can open it at once.</span>
        @if (wsError()) {
          <div class="form-error" role="alert">{{ wsError() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="wsOpen.set(false)">Cancel</button>
        <button type="submit" form="add-ws" class="btn primary" [disabled]="wsSaving()">
          @if (wsSaving()) {
            <span class="spinner"></span>
          }
          Add workspace
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1000px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .section {
      margin-top: 16px;
    }
    .pad {
      padding: 16px 20px 0;
    }
    p.pad {
      padding: 0 20px 18px;
    }
    .invites li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-top: 1px solid var(--border);
    }
    .link {
      color: var(--muted);
      max-width: 100%;
      display: block;
    }
  `,
})
export class PlatformOrganizationDetailPage implements OnInit {
  readonly id = input<string>();

  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected readonly org = signal<PlatformOrganizationDetail | null>(null);
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly statusBusy = signal(false);
  protected readonly busy = computed(() => this.saving() || this.statusBusy());
  protected readonly name = signal('');
  protected readonly notes = signal('');
  protected readonly limits = signal<Record<string, string>>({});
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');
  protected readonly limitFields = LIMIT_FIELDS;

  protected readonly wsOpen = signal(false);
  protected readonly wsName = signal('');
  protected readonly wsTz = signal(browserTimezone());
  protected readonly wsSaving = signal(false);
  protected readonly wsError = signal('');
  protected readonly timezones = allTimezones();

  ngOnInit() {
    this.load();
  }

  private load() {
    this.api.get<PlatformOrganizationDetail>(`platform/organizations/${this.id()}/detail/`).subscribe({
      next: (o) => this.hydrate(o),
      error: (err) => this.error.set(formatError(err)),
    });
  }

  private hydrate(o: PlatformOrganizationDetail) {
    this.org.set(o);
    this.name.set(o.name);
    this.notes.set(o.notes ?? '');
    const l: Record<string, string> = {};
    for (const f of LIMIT_FIELDS) l[f.key] = limitToInput(o[f.key as LimitKey]);
    this.limits.set(l);
  }

  protected setLimit(key: string, value: string | number | null) {
    this.limits.update((l) => ({ ...l, [key]: value === null || value === undefined ? '' : String(value) }));
  }

  protected link(token: string, email: string) {
    return inviteLink(token, email);
  }

  protected async copy(text: string) {
    if (await copyText(text)) this.toast.success('Invite link copied');
    else this.toast.error('Could not copy', 'Select the link and copy it manually.');
  }

  /** PATCH and merge the response into the detail view (the PATCH response lacks the detail lists). */
  private patch(body: Record<string, unknown>) {
    return this.api.patch<PlatformOrganization>(`platform/organizations/${this.id()}/`, body);
  }

  protected save() {
    const o = this.org();
    if (!o) return;
    const body: Record<string, unknown> = { name: this.name().trim(), notes: this.notes() };
    for (const f of LIMIT_FIELDS) body[f.key] = parseLimit(this.limits()[f.key]);
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    this.patch(body).subscribe({
      next: (u) => {
        this.saving.set(false);
        this.hydrate({ ...o, ...u });
        this.toast.success('Organization saved');
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        this.general.set(general || Object.values(fields).join('\n'));
      },
    });
  }

  protected async setStatus(status: 'active' | 'suspended') {
    const o = this.org();
    if (!o) return;
    const suspend = status === 'suspended';
    const ok = await this.confirm.ask({
      title: suspend ? `Suspend ${o.name}?` : `Reactivate ${o.name}?`,
      message: suspend
        ? 'Members will see a "suspended" screen, every workspace API call returns 403, and scheduled publications stay paused until you reactivate it. No data is deleted.'
        : 'Members regain access and scheduled publications resume. Anything whose time passed while suspended will go out right away.',
      confirmLabel: suspend ? 'Suspend organization' : 'Reactivate',
      danger: suspend,
    });
    if (!ok) return;
    this.statusBusy.set(true);
    this.patch({ status }).subscribe({
      next: (u) => {
        this.statusBusy.set(false);
        this.org.set({ ...o, ...u });
        this.toast.success(suspend ? 'Organization suspended' : 'Organization reactivated');
      },
      error: (err) => {
        this.statusBusy.set(false);
        this.toast.error('Could not change the status', err);
      },
    });
  }

  protected async remove() {
    const o = this.org();
    if (!o) return;
    const ok = await this.confirm.ask({
      title: `Delete ${o.name}?`,
      message: `This permanently deletes the organization, its ${o.workspaces.length} workspace(s), channels, posts, media and analytics. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      typeToConfirm: o.name,
    });
    if (!ok) return;
    this.statusBusy.set(true);
    this.api.delete(`platform/organizations/${o.id}/`).subscribe({
      next: () => {
        this.toast.success('Organization deleted');
        this.router.navigateByUrl('/platform/organizations');
      },
      error: (err) => {
        this.statusBusy.set(false);
        this.toast.error('Could not delete', err);
      },
    });
  }

  protected openAddWs() {
    this.wsName.set('');
    this.wsTz.set(browserTimezone());
    this.wsError.set('');
    this.wsOpen.set(true);
  }

  protected addWs() {
    if (!this.wsName().trim()) {
      this.wsError.set('Give the workspace a name.');
      return;
    }
    this.wsSaving.set(true);
    this.api.post(`platform/organizations/${this.id()}/workspaces/`, { name: this.wsName().trim(), timezone: this.wsTz() }).subscribe({
      next: () => {
        this.wsSaving.set(false);
        this.wsOpen.set(false);
        this.toast.success('Workspace added');
        this.load();
      },
      error: (err) => {
        this.wsSaving.set(false);
        this.wsError.set(formatError(err));
      },
    });
  }
}
