import { ServerConfigService } from '../../core/server-config.service';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { fieldErrors } from '../../core/errors';
import { Invitation, Membership, Role } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including deleting the workspace',
  admin: 'Manage channels, team and settings',
  editor: 'Write, schedule and publish posts',
  viewer: 'Read-only access',
};

@Component({
  selector: 'app-members-section',
  imports: [FormsModule, AvatarComponent, IconComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card flush">
      <div class="card-head pad">
        <h2>Workspace members</h2>
        <span class="muted small">{{ members().length }} {{ members().length === 1 ? 'person' : 'people' }}</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Joined</th>
              @if (ws.isAdmin()) {
                <th><span class="sr-only">Actions</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (m of members(); track m.id) {
              <tr>
                <td>
                  <span class="row">
                    <app-avatar [name]="m.user.name || m.user.email" [size]="32" />
                    <span class="stack-sm" style="gap: 0">
                      <span class="strong">{{ m.user.name || m.user.email }}
                        @if (m.user.id === auth.user()?.id) {
                          <span class="chip accent" style="height: 18px; margin-left: 4px">You</span>
                        }
                      </span>
                      <span class="muted tiny">{{ m.user.email }}</span>
                    </span>
                  </span>
                </td>
                <td>
                  @if (ws.isAdmin() && (m.role !== 'owner' || ws.isOwner())) {
                    <label class="sr-only" [for]="'role-' + m.id">Role of {{ m.user.email }}</label>
                    <select [id]="'role-' + m.id" class="select sm" style="width: 130px" [ngModel]="m.role" (ngModelChange)="setRole(m, $event)">
                      @for (r of assignable(); track r) {
                        <option [value]="r">{{ r }}</option>
                      }
                    </select>
                  } @else {
                    <span class="chip" [title]="help[m.role]">{{ m.role }}</span>
                  }
                </td>
                <td class="muted small">{{ m.created_at | relTime }}</td>
                @if (ws.isAdmin()) {
                  <td style="text-align: right">
                    @if (m.role !== 'owner' || ws.isOwner()) {
                      <button type="button" class="btn danger-ghost sm" (click)="removeMember(m)">
                        {{ m.user.id === auth.user()?.id ? 'Leave' : 'Remove' }}
                      </button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (ws.isAdmin()) {
      <section class="card stack" style="margin-top: 16px">
        <div class="card-head" style="margin-bottom: 0">
          <div>
            <h2>Add from your organization</h2>
            <p class="muted small">People who already belong to {{ ws.active()?.organization_name || 'the organization' }} can be added directly. Organization owners and admins already have access to every workspace.</p>
          </div>
        </div>
        <form class="invite-form" (ngSubmit)="addExisting()">
          <div class="field" style="flex: 1">
            <label for="add-email">Email</label>
            <input id="add-email" name="addEmail" type="email" class="input" [(ngModel)]="addEmail" placeholder="colleague@company.com" />
          </div>
          <div class="field">
            <label for="add-role">Role</label>
            <select id="add-role" name="addRole" class="select" [(ngModel)]="addRole">
              @for (r of assignable(); track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </div>
          <button type="submit" class="btn" [disabled]="adding() || !addEmail().trim()">
            @if (adding()) {
              <span class="spinner"></span>
            } @else {
              <app-icon name="plus" [size]="16" />
            }
            Add member
          </button>
        </form>
        @if (addError()) {
          <div class="form-error" role="alert">{{ addError() }}</div>
        }
      </section>

      <section class="card stack" style="margin-top: 16px">
        <div class="card-head" style="margin-bottom: 0">
          <h2>Invite people</h2>
        </div>
        <form class="invite-form" (ngSubmit)="invite()">
          <div class="field" style="flex: 1">
            <label for="inv-email">Email</label>
            <input id="inv-email" name="email" type="email" class="input" [(ngModel)]="email" placeholder="teammate@company.com" [class.invalid]="fe()['email']" />
          </div>
          <div class="field">
            <label for="inv-role">Role</label>
            <select id="inv-role" name="role" class="select" [(ngModel)]="role">
              @for (r of assignable(); track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </div>
          <button type="submit" class="btn primary" [disabled]="inviting()">
            @if (inviting()) {
              <span class="spinner"></span>
            } @else {
              <app-icon name="send" [size]="16" />
            }
            Create invite
          </button>
        </form>
        <p class="hint muted tiny">{{ help[role()] }}. No email is sent: share the invite link yourself.</p>
        @if (inviteError()) {
          <div class="form-error" role="alert">{{ inviteError() }}</div>
        }

        @if (invitations().length) {
          <ul class="list-reset inv-list">
            @for (i of invitations(); track i.id) {
              <li [class.fresh]="i.id === lastInvite()">
                <div class="stack-sm" style="gap: 2px; min-width: 0; flex: 1">
                  <span class="strong truncate">{{ i.email }} <span class="chip" style="height: 20px">{{ i.role }}</span></span>
                  <code class="truncate link-text">{{ link(i) }}</code>
                </div>
                <span class="muted tiny">{{ i.created_at | relTime }}</span>
                <button type="button" class="btn sm" (click)="copy(i)"><app-icon name="copy" [size]="14" /> Copy link</button>
                <button type="button" class="btn danger-ghost sm" (click)="revoke(i)">Revoke</button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted small">No pending invitations.</p>
        }
      </section>
    }
  `,
  styles: `
    .pad {
      padding: 18px 20px 0;
    }
    .invite-form {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .inv-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .inv-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .inv-list li:last-child {
      border-bottom: 0;
    }
    .inv-list li.fresh {
      background: var(--accent-soft);
    }
    .link-text {
      color: var(--muted);
      font-size: 0.75rem;
      display: block;
    }
  `,
})
export class MembersSectionComponent implements OnInit {
  private readonly serverCfg = inject(ServerConfigService);
  protected readonly ws = inject(WorkspaceService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly help = ROLE_HELP;
  protected readonly members = signal<Membership[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly email = signal('');
  protected readonly role = signal<Role>('editor');
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal('');
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly lastInvite = signal<number | null>(null);
  protected readonly addEmail = signal('');
  protected readonly addRole = signal<Role>('editor');
  protected readonly adding = signal(false);
  protected readonly addError = signal('');

  protected assignable(): Role[] {
    return this.ws.isOwner() ? ['viewer', 'editor', 'admin', 'owner'] : ['viewer', 'editor', 'admin'];
  }

  ngOnInit() {
    this.api.list<Membership>('members/').subscribe({
      next: (m) => this.members.set(m),
      error: (err) => this.toast.error('Could not load members', err),
    });
    if (this.ws.isAdmin()) {
      this.api.list<Invitation>('invitations/').subscribe({
        next: (i) => this.invitations.set(i),
        error: () => undefined,
      });
    }
  }

  protected link(i: Invitation) {
    return `${this.serverCfg.publicOrigin()}/register?invitation=${encodeURIComponent(i.token)}&email=${encodeURIComponent(i.email)}`;
  }

  protected setRole(m: Membership, role: Role) {
    const prev = m.role;
    this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));
    this.api.patch<Membership>(`members/${m.id}/`, { role }).subscribe({
      next: (u) => {
        this.members.update((list) => list.map((x) => (x.id === u.id ? u : x)));
        this.toast.success('Role updated', `${u.user.name || u.user.email} is now ${u.role}.`);
      },
      error: (err) => {
        this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role: prev } : x)));
        this.toast.error('Could not change role', err);
      },
    });
  }

  protected async removeMember(m: Membership) {
    const self = m.user.id === this.auth.user()?.id;
    const ok = await this.confirm.ask({
      title: self ? 'Leave this workspace?' : `Remove ${m.user.name || m.user.email}?`,
      message: self ? 'You will lose access until someone invites you again.' : 'They will lose access to this workspace immediately.',
      confirmLabel: self ? 'Leave' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    this.api.delete(`members/${m.id}/`).subscribe({
      next: () => {
        this.members.update((list) => list.filter((x) => x.id !== m.id));
        this.toast.success(self ? 'You left the workspace' : 'Member removed');
        if (self) this.ws.reload().then(() => this.ws.setActive(this.ws.workspaces()[0]?.slug ?? ''));
      },
      error: (err) => this.toast.error('Could not remove member', err),
    });
  }

  protected addExisting() {
    const email = this.addEmail().trim();
    if (!email) return;
    this.adding.set(true);
    this.addError.set('');
    this.api.post<Membership>('members/', { email, role: this.addRole() }).subscribe({
      next: (m) => {
        this.adding.set(false);
        this.addEmail.set('');
        this.members.update((list) => [...list, m]);
        this.toast.success('Member added', `${m.user.name || m.user.email} joined as ${m.role}.`);
      },
      error: (err) => {
        this.adding.set(false);
        const { fields, general } = fieldErrors(err);
        this.addError.set([general, ...Object.values(fields)].filter(Boolean).join('\n'));
      },
    });
  }

  protected invite() {
    const email = this.email().trim();
    if (!email) {
      this.inviteError.set('Enter an email address.');
      return;
    }
    this.inviting.set(true);
    this.inviteError.set('');
    this.fe.set({});
    this.api.post<Invitation>('invitations/', { email, role: this.role() }).subscribe({
      next: (i) => {
        this.inviting.set(false);
        this.invitations.update((list) => [i, ...list]);
        this.lastInvite.set(i.id);
        this.email.set('');
        this.copy(i);
      },
      error: (err) => {
        this.inviting.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        this.inviteError.set([general, ...Object.values(fields)].filter(Boolean).join('\n'));
      },
    });
  }

  protected copy(i: Invitation) {
    const url = this.link(i);
    const done = () => this.toast.success('Invite link copied', `Send it to ${i.email}.`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => this.toast.info('Copy the invite link', url));
    } else {
      this.toast.info('Copy the invite link', url);
    }
  }

  protected async revoke(i: Invitation) {
    const ok = await this.confirm.ask({
      title: `Revoke invitation for ${i.email}?`,
      message: 'The invite link will stop working.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    this.api.delete(`invitations/${i.id}/`).subscribe({
      next: () => this.invitations.update((list) => list.filter((x) => x.id !== i.id)),
      error: (err) => this.toast.error('Could not revoke', err),
    });
  }
}
