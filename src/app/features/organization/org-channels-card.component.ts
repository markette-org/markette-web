import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Channel, Id, Workspace } from '../../core/models';
import { OrganizationService } from '../../core/organization.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

/** Organization-level channels and the workspaces they are relevant for (org admins). */
@Component({
  selector: 'app-org-channels-card',
  imports: [AvatarComponent, IconComponent, ModalComponent, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'channels' },
  template: `
    <section class="card flush" aria-labelledby="orgch-h">
      <div class="card-head pad">
        <div>
          <h2 id="orgch-h">Channels</h2>
          <p class="muted small">Accounts are connected once for the organization and every workspace can publish to them. Mark where each one is relevant so it is listed first there.</p>
        </div>
      </div>
      @if (loading()) {
        <div class="pad-b"><div class="skeleton" style="height: 60px"></div></div>
      } @else if (error()) {
        <div class="pad-b"><div class="form-error" role="alert">{{ error() }}</div></div>
      } @else if (!channels().length) {
        <p class="muted small pad-b">No channels connected yet. Connect them from a workspace's Channels page.</p>
      } @else {
        <ul class="list-reset rows">
          @for (c of channels(); track c.id) {
            <li class="ch-row">
              <app-avatar [src]="c.avatar_url" [name]="c.name" [provider]="c.provider" [size]="36" />
              <div class="who">
                <div class="row-wrap">
                  <strong class="truncate">{{ c.name }}</strong>
                  <app-status-chip [status]="c.status" />
                </div>
                <div class="muted tiny truncate">{{ c.provider_label }}{{ c.handle ? ' · @' + c.handle.replace('@', '') : '' }}</div>
                <div class="row-wrap ws-chips">
                  @if ((c.workspaces ?? []).length) {
                    <span class="muted tiny">Relevant in</span>
                  }
                  @for (w of c.workspaces ?? []; track w.id) {
                    <span class="chip outline">{{ w.name }}</span>
                  } @empty {
                    <span class="chip">Not relevant anywhere</span>
                  }
                </div>
              </div>
              <div class="row-wrap acts">
                <button type="button" class="btn sm" (click)="openShare(c)"><app-icon name="target" [size]="14" /> Relevant for…</button>
                <button type="button" class="btn danger-ghost sm" (click)="disconnect(c)" [disabled]="busy() === c.id">Disconnect everywhere</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <app-modal [open]="!!sharing()" [title]="'Relevant for… ' + (sharing()?.name ?? '')" subtitle="Choose the workspaces where this account is relevant." (closed)="sharing.set(null)" [dismissible]="!saving()">
      <div class="stack">
        <p class="muted small">
          Every workspace of the organization can use every channel. Relevance only lists the channel first and highlights it in the chosen workspaces.
          Connecting an account from a workspace marks it relevant there. Leaving all boxes unticked is fine.
        </p>
        <ul class="list-reset ws-pick">
          @for (w of orgWorkspaces(); track w.id) {
            <li>
              <label class="checkbox">
                <input type="checkbox" [checked]="selected().includes(w.id)" (change)="toggle(w.id, $any($event.target).checked)" />
                {{ w.name }}
                @if (w.is_archived) {
                  <span class="chip outline">Archived</span>
                }
              </label>
            </li>
          }
        </ul>
        @if (shareError()) {
          <div class="form-error" role="alert">{{ shareError() }}</div>
        }
      </div>
      <div modal-footer>
        <button type="button" class="btn" (click)="sharing.set(null)" [disabled]="saving()">Cancel</button>
        <button type="button" class="btn primary" (click)="saveShare()" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          Save
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    :host {
      display: block;
      scroll-margin-top: calc(var(--topbar-h) + 16px);
    }
    .pad {
      padding: 18px 20px 0;
    }
    .pad-b {
      padding: 0 20px 18px;
      display: block;
    }
    .rows {
      border-top: 1px solid var(--border);
    }
    .ch-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .ch-row:last-child {
      border-bottom: 0;
    }
    .who {
      flex: 1;
      min-width: 200px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ws-chips {
      gap: 4px;
      margin-top: 2px;
    }
    .ws-chips .chip {
      height: 20px;
      font-size: 0.7rem;
    }
    .ws-pick {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
})
export class OrgChannelsCardComponent {
  readonly orgId = input.required<Id>();

  private readonly orgs = inject(OrganizationService);
  private readonly ws = inject(WorkspaceService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly channels = signal<Channel[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<Id | null>(null);
  protected readonly sharing = signal<Channel | null>(null);
  protected readonly selected = signal<Id[]>([]);
  protected readonly saving = signal(false);
  protected readonly shareError = signal('');

  protected readonly orgWorkspaces = computed<Workspace[]>(() =>
    this.ws
      .workspaces()
      .filter((w) => w.organization === this.orgId())
      .sort((a, b) => Number(!!a.is_archived) - Number(!!b.is_archived) || a.name.localeCompare(b.name)),
  );

  constructor() {
    effect(() => {
      const id = this.orgId();
      untracked(() => this.load(id));
    });
  }

  private load(id: Id) {
    this.loading.set(true);
    this.orgs.channels(id).subscribe({
      next: (list) => {
        this.channels.set([...list].sort((a, b) => a.name.localeCompare(b.name)));
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatError(err));
      },
    });
  }

  protected openShare(c: Channel) {
    this.selected.set((c.workspaces ?? []).map((w) => w.id));
    this.shareError.set('');
    this.sharing.set(c);
  }

  protected toggle(id: Id, on: boolean) {
    this.selected.update((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  }

  protected saveShare() {
    const ch = this.sharing();
    if (!ch) return;
    this.saving.set(true);
    this.shareError.set('');
    this.orgs.shareChannel(this.orgId(), ch.id, this.selected()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.channels.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
        this.sharing.set(null);
        const n = (updated.workspaces ?? []).length;
        this.toast.success('Relevance updated', n ? `${updated.name} is relevant in ${n} workspace${n === 1 ? '' : 's'}.` : `${updated.name} is not marked relevant anywhere.`);
        this.catalog.loadChannels(true).subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.saving.set(false);
        this.shareError.set(formatError(err));
      },
    });
  }

  protected async disconnect(c: Channel) {
    const ok = await this.confirm.ask({
      title: `Disconnect ${c.name} everywhere?`,
      message:
        'The account is disconnected from every workspace of the organization. Its publication history and metrics are deleted; posts already live on the network stay there.',
      confirmLabel: 'Disconnect everywhere',
      danger: true,
      typeToConfirm: c.name,
    });
    if (!ok) return;
    this.busy.set(c.id);
    this.orgs.disconnectChannel(this.orgId(), c.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.channels.update((list) => list.filter((x) => x.id !== c.id));
        this.toast.success(`${c.name} disconnected`);
        this.catalog.loadChannels(true).subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not disconnect', err);
      },
    });
  }
}
