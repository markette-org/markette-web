import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { fieldErrors, formatError } from '../../core/errors';
import { Id, Membership, Team, TeamMember, TeamRole } from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';

const SWATCHES = ['#6d5efc', '#4f2cf0', '#ff7a59', '#0f9d6b', '#1f6fd9', '#c2398f', '#e3a008', '#0aa2b5'];

interface TeamForm {
  name: string;
  description: string;
  color: string;
  requires_approval: boolean;
  channels: Id[];
}

@Component({
  selector: 'app-teams-section',
  imports: [MoreChannelsComponent, FormsModule, AvatarComponent, IconComponent, ModalComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" style="gap: 16px">
      <section class="card explain">
        <div class="row" style="align-items: flex-start; gap: 14px">
          <div class="explain-icon"><app-icon name="users" [size]="20" /></div>
          <div class="stack-sm">
            <h2>How teams work</h2>
            <ul class="rules small">
              <li><strong>Channel access:</strong> a channel assigned to one or more teams is visible and usable only by those teams' members and by workspace admins.</li>
              <li><strong>Open channels:</strong> channels not assigned to any team stay open to everyone in the workspace.</li>
              <li><strong>Approval:</strong> when a team requires approval, its <em>members</em> submit posts for review; a <em>reviewer</em> approves them before anything is scheduled. Reviewers and admins publish directly.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Teams</h2>
          @if (canManage()) {
            <button type="button" class="btn primary sm" (click)="openCreate()"><app-icon name="plus" [size]="14" /> New team</button>
          }
        </div>

        @if (loading()) {
          <div class="skeleton" style="height: 140px"></div>
        } @else if (!teams().length) {
          <app-empty-state icon="users" title="No teams yet" [text]="canManage() ? 'Create a team to limit who publishes to which channels, or to require approval before posts go out.' : 'An admin can create teams to organise who publishes where.'">
            @if (canManage()) {
              <button type="button" class="btn primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> Create a team</button>
            }
          </app-empty-state>
        } @else {
          <div class="team-list">
            @for (t of teams(); track t.id) {
              <article class="team" [style.--team]="t.color">
                <div class="team-head">
                  <span class="dot" [style.background]="t.color"></span>
                  <div class="team-title">
                    <h3>{{ t.name }}</h3>
                    @if (t.description) {
                      <p class="muted small">{{ t.description }}</p>
                    }
                  </div>
                  <div class="row-wrap" style="justify-content: flex-end">
                    @if (t.requires_approval) {
                      <span class="chip warning"><app-icon name="check" [size]="12" /> Requires approval</span>
                    }
                    @if (t.my_role) {
                      <span class="chip accent">You: {{ t.my_role }}</span>
                    }
                  </div>
                </div>

                <div class="team-meta">
                  <div class="stack-sm">
                    <span class="label-sm">Channels</span>
                    <div class="row-wrap">
                      @for (cid of t.channels; track cid) {
                        @if (catalog.channel(cid); as ch) {
                          <span class="ch" [attr.title]="ch.name"><app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="26" /></span>
                        }
                      } @empty {
                        <span class="muted small">No channels assigned</span>
                      }
                    </div>
                  </div>
                  <div class="stack-sm">
                    <span class="label-sm">Members</span>
                    <span class="small">{{ t.members.length }} · {{ reviewerCount(t) }} reviewer{{ reviewerCount(t) === 1 ? '' : 's' }}</span>
                  </div>
                </div>

                <div class="row-wrap">
                  <button type="button" class="btn sm" (click)="toggleExpand(t.id)" [attr.aria-expanded]="expanded() === t.id">
                    <app-icon name="users" [size]="14" /> {{ expanded() === t.id ? 'Hide members' : 'Members' }}
                  </button>
                  @if (canManage()) {
                    <button type="button" class="btn sm ghost" (click)="openEdit(t)"><app-icon name="edit" [size]="14" /> Edit</button>
                    <button type="button" class="btn sm danger-ghost" (click)="remove(t)"><app-icon name="trash" [size]="14" /> Delete</button>
                  }
                </div>

                @if (expanded() === t.id) {
                  <div class="members">
                    @for (m of t.members; track m.id) {
                      <div class="member">
                        <app-avatar [name]="m.name || m.email" [size]="30" />
                        <div class="stack-sm" style="gap: 0; min-width: 0; flex: 1">
                          <span class="strong small truncate">{{ m.name || m.email }}</span>
                          @if (m.name) {
                            <span class="muted tiny truncate">{{ m.email }}</span>
                          }
                        </div>
                        @if (canManage()) {
                          <label class="sr-only" [for]="'role-' + m.id">Role of {{ m.email }}</label>
                          <select class="select sm" style="width: 130px" [id]="'role-' + m.id" [ngModel]="m.role" (ngModelChange)="setRole(t, m, $event)">
                            <option value="member">Member</option>
                            <option value="reviewer">Reviewer</option>
                          </select>
                          <button type="button" class="btn sm icon ghost" (click)="removeMember(t, m)" [attr.aria-label]="'Remove ' + m.email"><app-icon name="x" [size]="14" /></button>
                        } @else {
                          <span class="chip">{{ m.role }}</span>
                        }
                      </div>
                    } @empty {
                      <p class="muted small">No members yet.</p>
                    }
                    @if (canManage()) {
                      <form class="add-member" (ngSubmit)="addMember(t)">
                        <label class="sr-only" [for]="'add-' + t.id">Email</label>
                        <input class="input sm" [id]="'add-' + t.id" name="email" type="email" list="ws-members" [(ngModel)]="newEmail" placeholder="Email of a workspace member" autocomplete="off" />
                        <select class="select sm" style="width: 130px" name="role" [(ngModel)]="newRole" aria-label="Role">
                          <option value="member">Member</option>
                          <option value="reviewer">Reviewer</option>
                        </select>
                        <button type="submit" class="btn sm primary" [disabled]="adding() || !newEmail().trim()">
                          @if (adding()) {
                            <span class="spinner"></span>
                          }
                          Add
                        </button>
                      </form>
                      @if (memberError()) {
                        <div class="form-error small" role="alert">{{ memberError() }}</div>
                      }
                    }
                  </div>
                }
              </article>
            }
          </div>
          <datalist id="ws-members">
            @for (m of wsMembers(); track m.id) {
              <option [value]="m.user.email">{{ m.user.name }}</option>
            }
          </datalist>
        }
      </section>
    </div>

    <app-modal [open]="formOpen()" [title]="editing() ? 'Edit team' : 'New team'" subtitle="Teams decide who can publish to which channels." (closed)="formOpen.set(false)" [dismissible]="!saving()">
      <form id="team-form" class="stack" (ngSubmit)="save()">
        <div class="field">
          <label for="t-name">Name</label>
          <input id="t-name" name="name" class="input" [class.invalid]="fe()['name']" [ngModel]="form().name" (ngModelChange)="patch({ name: $event })" required />
          @if (fe()['name']) {
            <span class="error">{{ fe()['name'] }}</span>
          }
        </div>
        <div class="field">
          <label for="t-desc">Description</label>
          <textarea id="t-desc" name="desc" class="textarea" rows="2" [ngModel]="form().description" (ngModelChange)="patch({ description: $event })"></textarea>
        </div>
        <div class="field">
          <span class="label">Colour</span>
          <div class="row-wrap">
            @for (c of swatches; track c) {
              <button type="button" class="swatch" [style.background]="c" [class.on]="form().color === c" (click)="patch({ color: c })" [attr.aria-label]="'Colour ' + c" [attr.aria-pressed]="form().color === c"></button>
            }
            <input type="color" class="color-input" name="color" [ngModel]="form().color" (ngModelChange)="patch({ color: $event })" aria-label="Custom colour" />
          </div>
        </div>
        <div class="field">
          <label class="switch">
            <input type="checkbox" name="approval" [ngModel]="form().requires_approval" (ngModelChange)="patch({ requires_approval: $event })" />
            <span class="track"></span>
            <span><strong>Requires approval</strong></span>
          </label>
          <span class="hint">Members' posts to this team's channels are submitted for review and only scheduled after a reviewer approves. Reviewers and workspace admins publish directly.</span>
        </div>
        <fieldset class="field" style="border: 0; padding: 0; margin: 0">
          <legend class="label" style="margin-bottom: 6px">Channels</legend>
          <div class="ch-picker">
            @for (ch of catalog.relevantChannels(); track ch.id) {
              <button type="button" class="ch-toggle" [class.on]="form().channels.includes(ch.id)" [attr.aria-pressed]="form().channels.includes(ch.id)" (click)="toggleChannel(ch.id)">
                <app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="26" />
                <span class="truncate">{{ ch.name }}</span>
              </button>
            } @empty {
              <span class="muted small">{{ catalog.channels().length ? 'No channels are marked relevant for this workspace.' : 'No channels connected yet.' }}</span>
            }
          </div>
          <app-more-channels [count]="catalog.otherChannels().length" [forceOpen]="form().channels.some(isOther)">
            <div class="ch-picker">
              @for (ch of catalog.otherChannels(); track ch.id) {
                <button type="button" class="ch-toggle" [class.on]="form().channels.includes(ch.id)" [attr.aria-pressed]="form().channels.includes(ch.id)" (click)="toggleChannel(ch.id)">
                  <app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="26" />
                  <span class="truncate">{{ ch.name }}</span>
                </button>
              }
            </div>
          </app-more-channels>
          <span class="hint">Assigned channels become visible only to this team's members (and admins).</span>
        </fieldset>
        @if (general()) {
          <div class="form-error" role="alert">{{ general() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="team-form" class="btn primary" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          {{ editing() ? 'Save team' : 'Create team' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .explain-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      flex: none;
    }
    .rules {
      margin: 4px 0 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--text-2);
    }
    .team-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .team {
      border: 1px solid var(--border);
      border-left: 4px solid var(--team, var(--accent));
      border-radius: 14px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .team-head {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .team-title {
      flex: 1;
      min-width: 0;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-top: 4px;
      flex: none;
    }
    .team-meta {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
    }
    .label-sm {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .members {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .member {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .add-member {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .add-member .input {
      flex: 1;
      min-width: 200px;
    }
    .swatch {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid var(--surface);
      box-shadow: 0 0 0 1px var(--border-strong);
      cursor: pointer;
      padding: 0;
    }
    .swatch.on {
      box-shadow: 0 0 0 2px var(--text);
    }
    .color-input {
      width: 36px;
      height: 30px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      padding: 2px;
      background: var(--surface);
      cursor: pointer;
    }
    .ch-picker {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ch-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 3px 10px 3px 3px;
      border-radius: 999px;
      border: 1.5px solid var(--border);
      background: var(--surface);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-2);
      cursor: pointer;
      max-width: 220px;
      opacity: 0.75;
    }
    .ch-toggle.on {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-ink);
      opacity: 1;
    }
  `,
})
export class TeamsSectionComponent implements OnInit {
  /** Channel not marked relevant for this workspace. */
  protected readonly isOther = (id: number) => !this.catalog.isRelevant(id);
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly teamsApi = inject(TeamsService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly swatches = SWATCHES;
  protected readonly teams = computed(() => this.catalog.teams());
  protected readonly loading = signal(true);
  protected readonly canManage = computed(() => this.ws.isAdmin() && !this.ws.archived());
  protected readonly wsMembers = signal<Membership[]>([]);

  protected readonly expanded = signal<Id | null>(null);
  protected readonly newEmail = signal('');
  protected readonly newRole = signal<TeamRole>('member');
  protected readonly adding = signal(false);
  protected readonly memberError = signal('');

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Team | null>(null);
  protected readonly form = signal<TeamForm>(this.blank());
  protected readonly saving = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');

  ngOnInit() {
    forkJoin([this.catalog.loadTeams(true), this.catalog.loadChannels()]).subscribe({
      next: () => this.loading.set(false),
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load teams', err);
      },
    });
    if (this.ws.isAdmin()) {
      this.api.list<Membership>('members/').subscribe({ next: (m) => this.wsMembers.set(m), error: () => undefined });
    }
  }

  private blank(): TeamForm {
    return { name: '', description: '', color: SWATCHES[0], requires_approval: false, channels: [] };
  }

  protected reviewerCount(t: Team) {
    return t.members.filter((m) => m.role === 'reviewer').length;
  }

  protected toggleExpand(id: Id) {
    this.expanded.set(this.expanded() === id ? null : id);
    this.newEmail.set('');
    this.memberError.set('');
  }

  protected patch(p: Partial<TeamForm>) {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected toggleChannel(id: Id) {
    const list = this.form().channels;
    this.patch({ channels: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  }

  protected openCreate() {
    this.editing.set(null);
    this.form.set(this.blank());
    this.fe.set({});
    this.general.set('');
    this.formOpen.set(true);
  }

  protected openEdit(t: Team) {
    this.editing.set(t);
    this.form.set({
      name: t.name,
      description: t.description,
      color: t.color || SWATCHES[0],
      requires_approval: t.requires_approval,
      channels: [...t.channels],
    });
    this.fe.set({});
    this.general.set('');
    this.formOpen.set(true);
  }

  private refresh() {
    this.catalog.loadTeams(true).subscribe({ error: () => undefined });
    this.catalog.loadChannels(true).subscribe({ error: () => undefined });
  }

  protected save() {
    const f = this.form();
    if (!f.name.trim()) {
      this.fe.set({ name: 'Give the team a name.' });
      return;
    }
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    const data = { ...f, name: f.name.trim() };
    const ed = this.editing();
    const req = ed ? this.teamsApi.update(ed.id, data) : this.teamsApi.create(data);
    req.subscribe({
      next: (t) => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(ed ? 'Team saved' : 'Team created', t.name);
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        const other = Object.entries(fields)
          .filter(([k]) => k !== 'name')
          .map(([k, v]) => `${k}: ${v}`);
        this.general.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }

  protected async remove(t: Team) {
    const ok = await this.confirm.ask({
      title: `Delete ${t.name}?`,
      message: 'Its channels become open to everyone in the workspace unless another team still covers them.',
      confirmLabel: 'Delete team',
      danger: true,
    });
    if (!ok) return;
    this.teamsApi.remove(t.id).subscribe({
      next: () => {
        this.toast.success('Team deleted');
        this.refresh();
      },
      error: (err) => this.toast.error('Could not delete team', err),
    });
  }

  protected addMember(t: Team) {
    const email = this.newEmail().trim();
    if (!email) return;
    this.adding.set(true);
    this.memberError.set('');
    this.teamsApi.addMember(t.id, email, this.newRole()).subscribe({
      next: () => {
        this.adding.set(false);
        this.newEmail.set('');
        this.refresh();
      },
      error: (err) => {
        this.adding.set(false);
        this.memberError.set(formatError(err));
      },
    });
  }

  protected setRole(t: Team, m: TeamMember, role: TeamRole) {
    this.teamsApi.updateMember(t.id, m.id, role).subscribe({
      next: () => this.refresh(),
      error: (err) => {
        this.toast.error('Could not change role', err);
        this.refresh();
      },
    });
  }

  protected async removeMember(t: Team, m: TeamMember) {
    const ok = await this.confirm.ask({
      title: `Remove ${m.name || m.email} from ${t.name}?`,
      message: "They lose access to this team's channels unless another team or an admin role grants it.",
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    this.teamsApi.removeMember(t.id, m.id).subscribe({
      next: () => this.refresh(),
      error: (err) => this.toast.error('Could not remove member', err),
    });
  }
}
