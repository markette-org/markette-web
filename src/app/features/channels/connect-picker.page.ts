import { ExternalService } from '../../core/native/external.service';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Candidate, Channel, ConnectionRequest } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { providerMeta } from '../../shared/utils/providers';

@Component({
  selector: 'app-connect-picker-page',
  imports: [RouterLink, AvatarComponent, IconComponent, ProviderIconComponent, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      <a routerLink="/channels" class="back small"><app-icon name="arrowLeft" [size]="14" /> Channels</a>
      <header class="page-header">
        <div>
          <div class="eyebrow">Connect {{ label() }}</div>
          <h1>Choose accounts to add</h1>
          <p class="subtitle">Your login gives access to several accounts. Pick the ones Markette should publish to.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="card stack">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton" style="height: 52px"></div>
          }
        </div>
      } @else if (problem(); as p) {
        <div class="card">
          <div class="empty">
            <div class="empty-icon" style="background: var(--danger-soft); color: var(--danger)"><app-icon name="alert" [size]="26" /></div>
            <h3>{{ p.title }}</h3>
            <p class="pre-wrap">{{ p.text }}</p>
            <div class="row-wrap" style="justify-content: center">
              <a routerLink="/channels" class="btn">Back to channels</a>
              @if (ws.isAdmin()) {
                <button type="button" class="btn primary" (click)="tryAgain()" [disabled]="restarting()">
                  @if (restarting()) {
                    <span class="spinner"></span>
                  }
                  Try again
                </button>
              }
            </div>
          </div>
        </div>
      } @else if (req(); as r) {
        @if (!r.candidates.length) {
          <div class="card">
            <div class="empty">
              <div class="empty-icon"><app-icon name="users" [size]="26" /></div>
              <h3>No accounts found</h3>
              <p>The login worked, but it gives no access to any account or page Markette can publish to. Check that you granted access to the pages you manage.</p>
              <div class="row-wrap" style="justify-content: center">
                <a routerLink="/channels" class="btn">Back to channels</a>
                <button type="button" class="btn primary" (click)="tryAgain()">Try again</button>
              </div>
            </div>
          </div>
        } @else {
          @for (g of groups(); track g.provider) {
            <section class="card flush group">
              <div class="group-head">
                <app-provider-icon [provider]="g.provider" [size]="22" />
                <h2>{{ g.label }}</h2>
                <span class="muted small">{{ g.items.length }} {{ g.items.length === 1 ? 'account' : 'accounts' }}</span>
                <span class="spacer"></span>
                <button type="button" class="link-btn small" (click)="toggleGroup(g.items)">
                  {{ allPicked(g.items) ? 'Select none' : 'Select all' }}
                </button>
              </div>
              <ul class="list-reset">
                @for (c of g.items; track c.external_id) {
                  <li>
                    <label class="cand" [class.on]="picked().has(c.external_id)">
                      <input type="checkbox" [checked]="picked().has(c.external_id)" (change)="toggle(c.external_id)" />
                      <app-avatar [src]="c.avatar_url" [name]="c.name" [provider]="c.provider" [size]="40" />
                      <span class="cand-text">
                        <span class="row" style="gap: 6px; min-width: 0">
                          <span class="strong truncate">{{ c.name }}</span>
                          @if (candidateKind(c.external_id); as k) {
                            <span class="chip accent" style="height: 20px; font-size: 0.68rem">{{ k }}</span>
                          }
                        </span>
                        <span class="muted small truncate">
                          @if (c.handle) {
                            {{ c.handle.startsWith('@') ? c.handle : '@' + c.handle }}
                          }
                          @if (c.followers_count !== null) {
                            · {{ c.followers_count | num }} followers
                          }
                        </span>
                      </span>
                      @if (c.profile_url) {
                        <a [href]="c.profile_url" target="_blank" rel="noopener" class="btn sm ghost icon" (click)="$event.stopPropagation()" [attr.aria-label]="'Open ' + c.name">
                          <app-icon name="external" [size]="14" />
                        </a>
                      }
                    </label>
                  </li>
                }
              </ul>
            </section>
          }

          @if (error()) {
            <div class="form-error" role="alert" style="margin-top: 14px">{{ error() }}</div>
          }

          <div class="foot">
            <span class="muted small">{{ picked().size }} selected</span>
            <span class="spacer"></span>
            <a routerLink="/channels" class="btn">Cancel</a>
            <button type="button" class="btn primary" (click)="submit()" [disabled]="!picked().size || saving()">
              @if (saving()) {
                <span class="spinner"></span>
              }
              Add {{ picked().size || '' }} {{ picked().size === 1 ? 'channel' : 'channels' }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow {
      max-width: 760px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .group {
      margin-bottom: 16px;
      overflow: hidden;
    }
    .group-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-2);
    }
    .group-head h2 {
      font-size: 0.98rem;
    }
    .cand {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 18px;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    li:last-child .cand {
      border-bottom: 0;
    }
    .cand:hover {
      background: var(--surface-2);
    }
    .cand.on {
      background: var(--accent-soft);
    }
    .cand input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }
    .cand-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .foot {
      position: sticky;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 0;
      background: linear-gradient(transparent, var(--bg) 30%);
    }
  `,
})
export class ConnectPickerPage {
  private readonly external = inject(ExternalService);
  readonly requestId = input.required<string>();
  /** ?error= from the OAuth callback redirect. */
  readonly error_ = input<string | undefined>(undefined, { alias: 'error' });

  protected readonly ws = inject(WorkspaceService);
  private api = inject(ApiService);
  private catalog = inject(CatalogService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly req = signal<ConnectionRequest | null>(null);
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly restarting = signal(false);
  protected readonly error = signal('');

  protected readonly label = computed(() => providerMeta(this.req()?.provider).label);

  protected readonly problem = computed<{ title: string; text: string } | null>(() => {
    if (this.loadError()) return { title: 'This connection could not be loaded', text: this.loadError() };
    const r = this.req();
    const qErr = this.error_();
    if (r?.completed) return { title: 'Already connected', text: 'These accounts were already added. You can find them on the Channels page.' };
    if (r?.expired || qErr === 'expired') return { title: 'This connection attempt expired', text: 'Connection attempts are valid for a short time. Start again to pick your accounts.' };
    if (qErr || r?.error) return { title: `${this.label()} did not connect`, text: r?.error || qErr || '' };
    return null;
  });

  protected readonly groups = computed(() => {
    const r = this.req();
    if (!r) return [];
    const map = new Map<string, Candidate[]>();
    for (const c of r.candidates) {
      const key = c.provider || r.provider;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === r.provider ? -1 : b === r.provider ? 1 : a.localeCompare(b)))
      .map(([provider, items]) => ({ provider, label: providerMeta(provider).label, items }));
  });

  constructor() {
    this.catalog.loadProviders().subscribe({ error: () => undefined });
    effect(() => {
      const id = this.requestId();
      this.load(id);
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.loadError.set('');
    this.api.get<ConnectionRequest>(`channels/connections/${id}/`).subscribe({
      next: (r) => {
        this.req.set(r);
        this.picked.set(
          new Set(r.candidates.filter((c) => (c.provider || r.provider) === r.provider).map((c) => c.external_id)),
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(formatError(err));
        this.loading.set(false);
      },
    });
  }

  protected toggle(id: string) {
    this.picked.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected allPicked(items: Candidate[]) {
    return items.every((c) => this.picked().has(c.external_id));
  }

  protected toggleGroup(items: Candidate[]) {
    const all = this.allPicked(items);
    this.picked.update((s) => {
      const n = new Set(s);
      for (const c of items) {
        if (all) n.delete(c.external_id);
        else n.add(c.external_id);
      }
      return n;
    });
  }

  protected submit() {
    if (!this.picked().size) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .post<Channel[]>(`channels/connections/${this.requestId()}/`, { external_ids: [...this.picked()] })
      .subscribe({
        next: (channels) => {
          this.toast.success(
            channels.length === 1 ? `${channels[0].name} connected` : `${channels.length} channels connected`,
          );
          this.catalog.loadChannels(true).subscribe({ error: () => undefined });
          this.router.navigateByUrl('/channels');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(formatError(err));
        },
      });
  }

  /** Restarts the OAuth flow for the same provider (re-using the instance URL is not possible here). */
  protected tryAgain() {
    const provider = this.req()?.provider;
    const meta = provider ? this.catalog.provider(provider) : undefined;
    // Credential providers and instance-based ones (Mastodon) need input: restart from the Channels page.
    if (!provider || !meta || meta.auth !== 'oauth2' || meta.instance_url) {
      this.router.navigateByUrl('/channels');
      return;
    }
    this.restarting.set(true);
    this.api.post<{ authorize_url?: string }>('channels/connect/', { provider }).subscribe({
      next: (res) => {
        if (res.authorize_url) void this.external.go(res.authorize_url, 'oauth');
        else this.router.navigateByUrl('/channels');
      },
      error: (err) => {
        this.restarting.set(false);
        this.toast.error('Could not restart the connection', err);
      },
    });
  }

  /** QQ candidates: external_id is "group:<openid>" or "channel:<id>". */
  protected candidateKind(externalId: string): string | null {
    if (externalId.startsWith('group:')) return 'Group';
    if (externalId.startsWith('channel:')) return 'Guild channel';
    return null;
  }
}
