import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatError } from '../../core/errors';
import { PlatformUser } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { PlatformHeaderComponent } from './platform-header.component';
import { copyText } from './platform-utils';

const PAGE = 25;

@Component({
  selector: 'app-platform-users-page',
  imports: [FormsModule, RouterLink, PlatformHeaderComponent, AvatarComponent, IconComponent, EmptyStateComponent, ModalComponent, TzDatePipe, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-platform-header title="Users" subtitle="Every account on the platform, with their organizations and access." />

      <div class="row-wrap filters">
        <div class="search">
          <app-icon name="search" [size]="16" />
          <input class="input" type="search" placeholder="Search email or name" aria-label="Search users" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </div>
        <label class="sr-only" for="f-active">Account status</label>
        <select id="f-active" class="select sm narrow" [ngModel]="active()" (ngModelChange)="active.set($event); reset()">
          <option value="">All accounts</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </select>
        <label class="sr-only" for="f-super">Role</label>
        <select id="f-super" class="select sm narrow" [ngModel]="superFilter()" (ngModelChange)="superFilter.set($event); reset()">
          <option value="">Everyone</option>
          <option value="true">Superadmins</option>
        </select>
        <span class="spacer"></span>
        <span class="muted small">{{ count() }} {{ count() === 1 ? 'user' : 'users' }}</span>
      </div>

      @if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      }

      <div class="card flush">
        @if (rows().length) {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>User</th><th>Organizations</th><th>Status</th><th>Joined</th><th>Last login</th></tr>
              </thead>
              <tbody>
                @for (u of rows(); track u.id) {
                  <tr class="click" tabindex="0" (click)="select(u)" (keydown.enter)="select(u)" [class.selected]="selected()?.id === u.id">
                    <td>
                      <div class="row">
                        <app-avatar [name]="u.name || u.email" [size]="30" />
                        <div class="stack-sm" style="gap: 0; min-width: 0">
                          <span class="strong truncate">{{ u.name || u.email }}</span>
                          @if (u.name) {
                            <span class="muted tiny truncate">{{ u.email }}</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="small">
                      @for (o of u.organizations; track o.id) {
                        <span class="chip outline org-chip">{{ o.name }}{{ o.role ? ' · ' + o.role : '' }}</span>
                      } @empty {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>
                      <div class="row-wrap">
                        @if (!u.is_active) {
                          <span class="chip danger">Deactivated</span>
                        } @else {
                          <span class="chip success">Active</span>
                        }
                        @if (u.is_superadmin) {
                          <span class="chip coral">Superadmin</span>
                        }
                      </div>
                    </td>
                    <td class="small muted">{{ u.date_joined | tzDate: 'date' }}</td>
                    <td class="small muted">{{ u.last_login ? (u.last_login | relTime) : 'Never' }}</td>
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
          <app-empty-state icon="users" title="No users found" text="Try a different search or filter." />
        }
      </div>
    </div>

    @if (selected(); as u) {
      <div class="drawer-backdrop" (click)="selected.set(null)" aria-hidden="true"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="user-drawer-title">
        <div class="drawer-head">
          <app-avatar [name]="u.name || u.email" [size]="36" />
          <div class="stack-sm" style="gap: 0; min-width: 0; flex: 1">
            <h2 id="user-drawer-title" class="truncate" style="font-size: 1.05rem">{{ u.name || u.email }}</h2>
            <span class="muted small truncate">{{ u.email }}</span>
          </div>
          <button type="button" class="btn ghost icon sm" (click)="selected.set(null)" aria-label="Close"><app-icon name="x" /></button>
        </div>
        <div class="drawer-body stack">
          <div class="row-wrap">
            <span class="chip" [class.success]="u.is_active" [class.danger]="!u.is_active">{{ u.is_active ? 'Active' : 'Deactivated' }}</span>
            @if (u.is_superadmin) {
              <span class="chip coral">Superadmin</span>
            }
            @if (isSelf()) {
              <span class="chip outline">You</span>
            }
          </div>

          <div class="field">
            <label for="u-name">Name</label>
            <div class="row">
              <input id="u-name" class="input" [(ngModel)]="nameDraft" (keydown.enter)="saveName()" />
              <button type="button" class="btn" (click)="saveName()" [disabled]="busy() || nameDraft() === (u.name || '')">Save</button>
            </div>
          </div>

          <dl class="facts">
            <dt>Joined</dt>
            <dd>{{ u.date_joined | tzDate }}</dd>
            <dt>Last login</dt>
            <dd>{{ u.last_login ? (u.last_login | tzDate) : 'Never' }}</dd>
          </dl>

          <div>
            <h3 class="sub">Organizations</h3>
            @for (o of u.organizations; track o.id) {
              <div class="org">
                <div class="row">
                  <a [routerLink]="['/platform/organizations', o.id]" class="strong">{{ o.name }}</a>
                  <span class="spacer"></span>
                  <span class="chip" [class.accent]="o.role === 'owner' || o.role === 'admin'">{{ o.role || 'workspace access only' }}</span>
                </div>
                @if (o.workspaces.length) {
                  <ul class="list-reset ws-list">
                    @for (w of o.workspaces; track w.id) {
                      <li><app-icon name="dashboard" [size]="13" /> {{ w.name }} <span class="muted">· {{ w.role }}</span></li>
                    }
                  </ul>
                } @else if (o.role === 'owner' || o.role === 'admin') {
                  <p class="muted tiny">Access to every workspace through the organization role.</p>
                }
              </div>
            } @empty {
              <p class="muted small">Not a member of any organization.</p>
            }
          </div>

          @if (isSelf()) {
            <p class="notice small"><app-icon name="info" [size]="14" /> You can't deactivate or demote your own account. Ask another superadmin.</p>
          }
        </div>
        <div class="drawer-foot">
          <button type="button" class="btn" [class.danger-ghost]="u.is_active" (click)="toggleActive(u)" [disabled]="busy() || isSelf()">
            <app-icon [name]="u.is_active ? 'pause' : 'check'" [size]="15" /> {{ u.is_active ? 'Deactivate' : 'Activate' }}
          </button>
          <button type="button" class="btn" (click)="toggleSuper(u)" [disabled]="busy() || isSelf()">
            <app-icon name="lock" [size]="15" /> {{ u.is_superadmin ? 'Revoke superadmin' : 'Grant superadmin' }}
          </button>
          <button type="button" class="btn" (click)="setPassword(u)" [disabled]="busy()"><app-icon name="refresh" [size]="15" /> Set temporary password</button>
        </div>
      </aside>
    }

    <app-modal [open]="!!tempPassword()" title="Temporary password" size="sm" [dismissible]="true" (closed)="tempPassword.set(null)">
      @if (tempPassword(); as t) {
        <div class="stack">
          <p class="small">New password for <strong>{{ t.email }}</strong>:</p>
          <div class="pw-box">
            <code class="mono">{{ t.password }}</code>
            <button type="button" class="btn sm" (click)="copyPw(t.password)"><app-icon name="copy" [size]="14" /> Copy</button>
          </div>
          <div class="notice warning small" role="alert">
            <app-icon name="alert" [size]="16" />
            <span>It is shown only once and can't be retrieved later. Share it through a secure channel and ask the user to change it after signing in. Their previous password no longer works.</span>
          </div>
        </div>
      }
      <div modal-footer>
        <button type="button" class="btn primary" (click)="tempPassword.set(null)">Done</button>
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
    .narrow {
      width: auto;
    }
    tr.click {
      cursor: pointer;
    }
    tr.selected td {
      background: var(--accent-soft) !important;
    }
    .org-chip {
      margin: 2px 4px 2px 0;
    }
    .pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-top: 1px solid var(--border);
    }
    .facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 14px;
      margin: 0;
      font-size: 0.88rem;
    }
    .facts dt {
      color: var(--muted);
    }
    .facts dd {
      margin: 0;
    }
    .sub {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .org {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .ws-list {
      margin-top: 6px;
      font-size: 0.84rem;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ws-list li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pw-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
    }
    .pw-box code {
      flex: 1;
      font-size: 1.05rem;
      word-break: break-all;
      user-select: all;
    }
  `,
})
export class PlatformUsersPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected readonly rows = signal<PlatformUser[]>([]);
  protected readonly count = signal(0);
  protected readonly offset = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly search = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly active = signal('');
  protected readonly superFilter = signal('');
  protected readonly selected = signal<PlatformUser | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly busy = signal(false);
  protected readonly tempPassword = signal<{ email: string; password: string } | null>(null);
  protected readonly isSelf = computed(() => this.selected()?.id === this.auth.user()?.id);

  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (!this.tempPassword()) this.selected.set(null);
  }

  protected onSearch(v: string) {
    this.search.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), 300);
  }

  protected reset() {
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
      .page<PlatformUser>('platform/users/', {
        search: this.search().trim(),
        is_active: this.active(),
        is_superuser: this.superFilter(),
        limit: PAGE,
        offset: this.offset(),
      })
      .subscribe({
        next: (p) => {
          this.rows.set(p.results);
          this.count.set(p.count);
          this.loading.set(false);
          // Deep link from the organization page: open the single match.
          if (this.search() && p.results.length === 1 && !this.selected() && this.route.snapshot.queryParamMap.get('search') === this.search()) {
            this.select(p.results[0]);
          }
        },
        error: (err) => {
          this.error.set(formatError(err));
          this.loading.set(false);
        },
      });
  }

  protected select(u: PlatformUser) {
    this.selected.set(u);
    this.nameDraft.set(u.name || '');
  }

  private patch(u: PlatformUser, body: Partial<Pick<PlatformUser, 'is_active' | 'is_superadmin' | 'name'>>, done: string) {
    this.busy.set(true);
    this.api.patch<PlatformUser>(`platform/users/${u.id}/`, body).subscribe({
      next: (upd) => {
        this.busy.set(false);
        this.rows.update((list) => list.map((x) => (x.id === upd.id ? upd : x)));
        if (this.selected()?.id === upd.id) this.select(upd);
        this.toast.success(done);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Could not update the user', err);
      },
    });
  }

  protected saveName() {
    const u = this.selected();
    if (!u) return;
    this.patch(u, { name: this.nameDraft().trim() }, 'Name updated');
  }

  protected async toggleActive(u: PlatformUser) {
    if (this.isSelf()) return;
    const deactivate = u.is_active;
    const ok = await this.confirm.ask({
      title: deactivate ? `Deactivate ${u.email}?` : `Activate ${u.email}?`,
      message: deactivate
        ? 'They will be signed out at their next request and can no longer sign in. Their memberships and content stay in place.'
        : 'They will be able to sign in again with their existing password.',
      confirmLabel: deactivate ? 'Deactivate' : 'Activate',
      danger: deactivate,
    });
    if (ok) this.patch(u, { is_active: !u.is_active }, deactivate ? 'User deactivated' : 'User activated');
  }

  protected async toggleSuper(u: PlatformUser) {
    if (this.isSelf()) return;
    const grant = !u.is_superadmin;
    const ok = await this.confirm.ask({
      title: grant ? `Make ${u.email} a superadmin?` : `Revoke superadmin from ${u.email}?`,
      message: grant
        ? 'Superadmins can see every organization and user, change plan limits, suspend organizations and reset passwords.'
        : 'They lose access to the platform console. Their organization memberships are unchanged.',
      confirmLabel: grant ? 'Grant superadmin' : 'Revoke',
      danger: grant,
    });
    if (ok) this.patch(u, { is_superadmin: grant }, grant ? 'Superadmin granted' : 'Superadmin revoked');
  }

  protected async setPassword(u: PlatformUser) {
    const ok = await this.confirm.ask({
      title: `Set a temporary password for ${u.email}?`,
      message: 'Their current password stops working immediately. You will see the new password once.',
      confirmLabel: 'Generate password',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.post<{ email: string; temporary_password: string }>(`platform/users/${u.id}/set-password/`).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.tempPassword.set({ email: r.email || u.email, password: r.temporary_password });
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Could not set a password', err);
      },
    });
  }

  protected async copyPw(pw: string) {
    if (await copyText(pw)) this.toast.success('Password copied');
    else this.toast.error('Could not copy', 'Select the password and copy it manually.');
  }
}
