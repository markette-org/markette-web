import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '../../core/catalog.service';
import { fieldErrors, formatError } from '../../core/errors';
import { Channel, Subscriber, SubscriberImportResult } from '../../core/models';
import { SubscribersService } from '../../core/subscribers.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';

const PAGE = 25;

/** WhatsApp broadcast list: opted-in subscribers, consented adds/imports, opt-outs, webhook setup. */
@Component({
  selector: 'app-subscribers-drawer',
  imports: [FormsModule, AvatarComponent, IconComponent, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (channel(); as ch) {
      <div class="drawer-backdrop" (click)="closed.emit()" aria-hidden="true"></div>
      <aside class="drawer subs-drawer" role="dialog" aria-modal="true" aria-labelledby="subs-title">
        <header class="drawer-head">
          <app-avatar [src]="ch.avatar_url" [name]="ch.name" provider="whatsapp" [size]="32" />
          <div style="flex: 1; min-width: 0">
            <h2 id="subs-title" class="truncate" style="font-size: 1.05rem">{{ ch.name }}</h2>
            <span class="muted small">{{ ch.setup?.subscribers ?? 0 }} opted-in subscribers</span>
          </div>
          <button type="button" class="btn ghost icon sm" (click)="closed.emit()" aria-label="Close"><app-icon name="x" /></button>
        </header>

        <div class="tabs" role="tablist" style="padding: 0 14px">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'subscribers'" (click)="tab.set('subscribers')">Subscribers</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'webhook'" (click)="tab.set('webhook')">Webhook setup</button>
        </div>

        <div class="drawer-body">
          @if (tab() === 'subscribers') {
            <div class="stack">
              <div class="notice accent small">
                <app-icon name="info" [size]="16" />
                <span>
                  WhatsApp has no API for Channels, so posts are sent as your <strong>approved template message</strong> to opted-in subscribers.
                  The post text fills the template's <code>{{ tplVar }}</code> variable (max 1024 characters); an optional image fills its IMAGE header.
                  Meta bills marketing messages per delivery.
                </span>
              </div>

              <div class="join card tight">
                <strong class="small">How people join</strong>
                <p class="small muted">
                  They send <strong>JOIN</strong> to your WhatsApp number and are added automatically; sending <strong>STOP</strong> opts them out.
                  Share this link:
                </p>
                @if (ch.profile_url) {
                  <div class="row">
                    <code class="mono-box truncate">{{ ch.profile_url }}</code>
                    <button type="button" class="btn sm" (click)="copy(ch.profile_url)"><app-icon name="copy" [size]="14" /> Copy</button>
                  </div>
                }
              </div>

              <div class="row-wrap">
                <label for="subs-search" class="sr-only">Search subscribers</label>
                <input id="subs-search" class="input sm" style="flex: 1; min-width: 160px" placeholder="Search number or name" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
                <label class="checkbox small">
                  <input type="checkbox" [checked]="activeOnly()" (change)="activeOnly.set($any($event.target).checked); reload(0)" />
                  Active only
                </label>
              </div>

              @if (loadError()) {
                <div class="form-error" role="alert">{{ loadError() }}</div>
              }

              <ul class="list-reset subs">
                @for (s of rows(); track s.id) {
                  <li [class.out]="!!s.opted_out_at">
                    <div class="stack-sm" style="flex: 1; min-width: 0; gap: 2px">
                      <span class="mono small">{{ s.address }}</span>
                      <span class="small truncate">{{ s.name || '—' }}</span>
                      <span class="tiny muted">
                        <span class="chip src">{{ sourceLabel[s.source] || s.source }}</span>
                        @if (s.opted_in_at) {
                          opted in {{ s.opted_in_at | tzDate: 'date' }}
                        }
                      </span>
                    </div>
                    @if (s.opted_out_at) {
                      <span class="chip outline" [title]="'Opted out ' + (s.opted_out_at | tzDate)">Opted out</span>
                    } @else if (ws.isAdmin()) {
                      <button type="button" class="btn sm danger-ghost" (click)="optOut(s)" [disabled]="busyId() === s.id">Opt out</button>
                    }
                  </li>
                } @empty {
                  @if (!loading()) {
                    <li class="muted small empty-row">{{ search() ? 'No subscribers match.' : 'No subscribers yet. Share the wa.me link or import a consented list.' }}</li>
                  }
                }
              </ul>
              @if (loading()) {
                <div class="skeleton" style="height: 60px"></div>
              }
              @if (count() > pageSize) {
                <div class="row">
                  <button type="button" class="btn sm" [disabled]="offset() === 0 || loading()" (click)="reload(offset() - pageSize)">Previous</button>
                  <span class="muted small spacer" style="text-align: center">{{ offset() + 1 }}–{{ min(offset() + pageSize, count()) }} of {{ count() }}</span>
                  <button type="button" class="btn sm" [disabled]="offset() + pageSize >= count() || loading()" (click)="reload(offset() + pageSize)">Next</button>
                </div>
              }

              @if (ws.isAdmin()) {
                <hr class="divider" />
                <div class="segmented" role="tablist" aria-label="Add subscribers">
                  <button type="button" role="tab" [attr.aria-selected]="addMode() === 'one'" (click)="addMode.set('one')">Add subscriber</button>
                  <button type="button" role="tab" [attr.aria-selected]="addMode() === 'bulk'" (click)="addMode.set('bulk')">Bulk import</button>
                </div>
                @if (addMode() === 'one') {
                  <div class="form-grid">
                    <div class="field">
                      <label for="sub-phone">Phone number</label>
                      <input id="sub-phone" class="input" [class.invalid]="addErrors()['address']" [ngModel]="phone()" (ngModelChange)="phone.set($event)" placeholder="+39 333 1234567" inputmode="tel" />
                      @if (addErrors()['address']) {
                        <span class="error">{{ addErrors()['address'] }}</span>
                      } @else {
                        <span class="hint">International format, with country code.</span>
                      }
                    </div>
                    <div class="field">
                      <label for="sub-name">Name</label>
                      <input id="sub-name" class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" placeholder="Optional" />
                    </div>
                  </div>
                } @else {
                  <div class="field">
                    <label for="sub-lines">One subscriber per line: <code>phone,name</code></label>
                    <textarea id="sub-lines" class="textarea mono" rows="6" [ngModel]="lines()" (ngModelChange)="lines.set($event)" placeholder="+39 333 1234567,Maria Rossi&#10;+44 7700 900123,Sam"></textarea>
                  </div>
                }
                <label class="checkbox consent">
                  <input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)" />
                  <span><strong>These people agreed to receive WhatsApp messages from us.</strong></span>
                </label>
                @if (addErrors()['consent'] || addError()) {
                  <div class="form-error" role="alert">{{ addErrors()['consent'] || addError() }}</div>
                }
                @if (importResult(); as r) {
                  <div class="notice" [class.success]="!r.invalid.length" [class.warning]="r.invalid.length > 0" role="status">
                    <app-icon [name]="r.invalid.length ? 'alert' : 'check'" [size]="16" />
                    <div>
                      <strong>{{ r.added }} added.</strong>
                      @if (r.invalid.length) {
                        {{ r.invalid.length }} {{ r.invalid.length === 1 ? 'line was' : 'lines were' }} skipped (invalid number):
                        <ul class="invalid mono tiny">
                          @for (bad of r.invalid; track $index) {
                            <li>{{ bad || '(empty)' }}</li>
                          }
                        </ul>
                      }
                    </div>
                  </div>
                }
                <div class="row">
                  <span class="spacer"></span>
                  <button
                    type="button"
                    class="btn primary"
                    [disabled]="!consent() || adding() || (addMode() === 'one' ? !phone().trim() : !lines().trim())"
                    (click)="add()"
                  >
                    @if (adding()) {
                      <span class="spinner"></span>
                    }
                    {{ addMode() === 'one' ? 'Add subscriber' : 'Import' }}
                  </button>
                </div>
              }
            </div>
          } @else {
            <div class="stack">
              <p class="small">Messages from subscribers (JOIN / STOP) reach Markette through a webhook. Configure it once per WhatsApp app:</p>
              <ol class="steps small">
                <li>In your Meta app, open <strong>WhatsApp → Configuration</strong>.</li>
                <li>Set the <strong>Callback URL</strong> and <strong>Verify token</strong> below, then verify.</li>
                <li>Under webhook fields, subscribe to <code>messages</code>.</li>
                <li>Make sure the Meta app secret is set in Platform settings (<code>META_APP_SECRET</code>); it is used to verify message signatures.</li>
              </ol>
              <div class="field">
                <span class="label">Callback URL</span>
                <div class="row">
                  <code class="mono-box truncate">{{ ch.setup?.webhook_url || '—' }}</code>
                  <button type="button" class="btn sm" [disabled]="!ch.setup?.webhook_url" (click)="copy(ch.setup?.webhook_url)"><app-icon name="copy" [size]="14" /> Copy</button>
                </div>
              </div>
              <div class="field">
                <span class="label">Verify token</span>
                <div class="row">
                  <code class="mono-box truncate">{{ ch.setup?.verify_token || '—' }}</code>
                  <button type="button" class="btn sm" [disabled]="!ch.setup?.verify_token" (click)="copy(ch.setup?.verify_token)"><app-icon name="copy" [size]="14" /> Copy</button>
                </div>
              </div>
            </div>
          }
        </div>
      </aside>
    }
  `,
  styles: `
    .subs-drawer {
      width: min(520px, 100vw);
    }
    .mono-box {
      flex: 1;
      padding: 7px 10px;
      border-radius: 8px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
      font-size: 0.8rem;
    }
    .join {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .subs {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .subs li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .subs li:last-child {
      border-bottom: 0;
    }
    .subs li.out {
      opacity: 0.6;
    }
    .subs .empty-row {
      justify-content: center;
      padding: 18px;
    }
    .src {
      height: 18px;
      font-size: 0.66rem;
      margin-right: 4px;
    }
    .consent {
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--warning-soft);
    }
    .consent input {
      margin-top: 2px;
    }
    .invalid {
      margin: 6px 0 0;
      padding-left: 18px;
      max-height: 120px;
      overflow-y: auto;
    }
    .steps {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `,
})
export class SubscribersDrawerComponent implements OnDestroy {
  readonly channel = input<Channel | null>(null);
  readonly initialTab = input<'subscribers' | 'webhook'>('subscribers');
  readonly closed = output<void>();

  protected readonly ws = inject(WorkspaceService);
  private readonly api = inject(SubscribersService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly pageSize = PAGE;
  protected readonly tplVar = '{{1}}';
  protected readonly sourceLabel: Record<string, string> = { keyword: 'JOIN', import: 'Import', manual: 'Manual' };
  protected readonly tab = signal<'subscribers' | 'webhook'>('subscribers');
  protected readonly rows = signal<Subscriber[]>([]);
  protected readonly count = signal(0);
  protected readonly offset = signal(0);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly search = signal('');
  protected readonly activeOnly = signal(true);
  protected readonly busyId = signal<number | null>(null);

  protected readonly addMode = signal<'one' | 'bulk'>('one');
  protected readonly phone = signal('');
  protected readonly name = signal('');
  protected readonly lines = signal('');
  protected readonly consent = signal(false);
  protected readonly adding = signal(false);
  protected readonly addError = signal('');
  protected readonly addErrors = signal<Record<string, string>>({});
  protected readonly importResult = signal<SubscriberImportResult | null>(null);

  private readonly channelId = computed(() => this.channel()?.id ?? null);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const id = this.channelId();
      untracked(() => {
        if (id === null) return;
        this.tab.set(this.initialTab());
        this.search.set('');
        this.activeOnly.set(true);
        this.resetForm();
        this.reload(0);
      });
    });
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.channel()) this.closed.emit();
  }

  protected min(a: number, b: number) {
    return Math.min(a, b);
  }

  private resetForm() {
    this.phone.set('');
    this.name.set('');
    this.lines.set('');
    this.consent.set(false);
    this.addError.set('');
    this.addErrors.set({});
    this.importResult.set(null);
  }

  protected onSearch(v: string) {
    this.search.set(v);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(0), 300);
  }

  protected reload(offset: number) {
    const id = this.channelId();
    if (id === null) return;
    this.loading.set(true);
    this.loadError.set('');
    this.api.list(id, { search: this.search().trim() || undefined, active: this.activeOnly(), limit: PAGE, offset: Math.max(0, offset) }).subscribe({
      next: (p) => {
        this.rows.set(p.results);
        this.count.set(p.count);
        this.offset.set(Math.max(0, offset));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  protected async optOut(s: Subscriber) {
    const id = this.channelId();
    if (id === null) return;
    const ok = await this.confirm.ask({
      title: `Opt out ${s.name || s.address}?`,
      message: 'They stay on record as opted out and will never be messaged again from this channel (unless they send JOIN again).',
      confirmLabel: 'Opt out',
      danger: true,
    });
    if (!ok) return;
    this.busyId.set(s.id);
    this.api.optOut(id, s.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Opted out', s.address);
        this.reload(this.offset());
        this.catalog.loadChannels(true).subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error('Could not opt out', err);
      },
    });
  }

  protected add() {
    const id = this.channelId();
    if (id === null || !this.consent()) return;
    this.adding.set(true);
    this.addError.set('');
    this.addErrors.set({});
    this.importResult.set(null);
    const req =
      this.addMode() === 'one'
        ? this.api.add(id, this.phone().trim(), this.name().trim())
        : this.api.import(id, this.lines());
    req.subscribe({
      next: (r) => {
        this.adding.set(false);
        if (this.addMode() === 'one') {
          this.toast.success('Subscriber added', this.phone().trim());
          this.phone.set('');
          this.name.set('');
        } else {
          this.importResult.set(r);
          if (!r.invalid.length) this.lines.set('');
        }
        this.consent.set(false);
        this.reload(0);
        this.catalog.loadChannels(true).subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.adding.set(false);
        const { fields, general } = fieldErrors(err);
        this.addErrors.set(fields);
        const other = Object.entries(fields)
          .filter(([k]) => k !== 'address' && k !== 'consent')
          .map(([, v]) => v);
        this.addError.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }

  protected async copy(text: string | null | undefined) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  }
}
