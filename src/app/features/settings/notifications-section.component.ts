import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { fieldErrors } from '../../core/errors';
import { NotificationCatalog, NotificationDelivery, NotificationDestination, NotificationKind, TelegramChats } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';
import { copyText } from '../platform/platform-utils';

const KIND_ICON: Record<NotificationKind, string> = { email: 'mail', telegram: 'send', webhook: 'zap' };

interface Draft {
  id: number | null;
  kind: NotificationKind;
  name: string;
  events: string[];
  to: string;
  botToken: string;
  chatId: string;
  chatTitle: string;
  url: string;
}

@Component({
  selector: 'app-notifications-section',
  imports: [FormsModule, IconComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack">
      <div class="card-head">
        <div>
          <h2>Notifications</h2>
          <p class="muted small">Hear about publications, failures, posts that need checking, channels to reconnect and approvals by email, through a Telegram status bot, or with signed webhooks for n8n, Zapier or your own systems.</p>
        </div>
      </div>

      @if (!ws.isAdmin()) {
        <div class="notice"><app-icon name="lock" [size]="16" /><span>Workspace admins set up notifications.</span></div>
      } @else if (loading()) {
        <div class="row"><span class="spinner"></span> Loading…</div>
      } @else {
        @if (secret(); as s) {
          <div class="notice success stack-sm" role="status">
            <div>
              <strong>Signing secret for {{ s.name }}</strong> — copy it now, it is not shown again.
              <span class="block small">Every request carries <code>X-Markette-Signature: sha256=…</code>, the HMAC-SHA256 of <code>{{ '{' }}X-Markette-Timestamp{{ '}' }}.{{ '{' }}body{{ '}' }}</code> with this secret.</span>
            </div>
            <div class="row">
              <code class="mono truncate secret">{{ s.value }}</code>
              <button type="button" class="btn sm" (click)="copy(s.value)"><app-icon name="copy" [size]="14" /> Copy</button>
              <button type="button" class="btn sm ghost" (click)="secret.set(null)">Done</button>
            </div>
          </div>
        }

        @for (d of destinations(); track d.id) {
          <article class="dest" [class.off]="!d.enabled">
            <div class="row">
              <span class="kind"><app-icon [name]="kindIcon(d.kind)" [size]="16" /></span>
              <div class="grow">
                <strong>{{ d.name }}</strong>
                <span class="block small muted truncate">{{ summary(d) }}</span>
              </div>
              <label class="switch" [title]="d.enabled ? 'On' : 'Off'">
                <input type="checkbox" [checked]="d.enabled" (change)="toggle(d)" [attr.aria-label]="'Send to ' + d.name" />
                <span class="track"></span>
              </label>
            </div>
            <div class="row-wrap events">
              @for (e of d.events; track e) {
                <span class="chip outline small">{{ eventLabel(e) }}</span>
              }
            </div>
            @if (d.last_error) {
              <div class="notice warning small"><app-icon name="alert" [size]="14" /><span>{{ d.last_error }}</span></div>
            } @else if (d.last_sent_at) {
              <p class="tiny muted">Last sent {{ d.last_sent_at | relTime }}</p>
            }
            <div class="row-wrap">
              <button type="button" class="btn sm" (click)="test(d)" [disabled]="busy() === d.id">
                @if (busy() === d.id) {
                  <span class="spinner"></span>
                } @else {
                  <app-icon name="send" [size]="14" />
                }
                Send a test
              </button>
              <button type="button" class="btn sm ghost" (click)="toggleLog(d)">{{ openLog() === d.id ? 'Hide' : 'Show' }} deliveries</button>
              <button type="button" class="btn sm ghost" (click)="edit(d)"><app-icon name="edit" [size]="14" /> Edit</button>
              @if (d.kind === 'webhook') {
                <button type="button" class="btn sm ghost" (click)="rotate(d)">New signing secret</button>
              }
              <div class="spacer"></div>
              <button type="button" class="btn sm danger-ghost" (click)="remove(d)"><app-icon name="trash" [size]="14" /> Remove</button>
            </div>
            @if (openLog() === d.id) {
              <table class="log small">
                <thead>
                  <tr><th>When</th><th>Event</th><th>Result</th></tr>
                </thead>
                <tbody>
                  @for (l of log(); track l.uid) {
                    <tr>
                      <td>{{ l.created_at | relTime }}</td>
                      <td><code>{{ l.event }}</code></td>
                      <td>
                        @switch (l.status) {
                          @case ('sent') {
                            <span class="success-text">Sent</span>
                          }
                          @case ('pending') {
                            <span class="warning-text">Retrying ({{ l.attempts }})</span>
                          }
                          @default {
                            <span class="danger-text">Failed</span>
                          }
                        }
                        @if (l.error) {
                          <span class="block muted">{{ l.error }}</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="3" class="muted">Nothing sent yet.</td></tr>
                  }
                </tbody>
              </table>
            }
          </article>
        } @empty {
          @if (!draft()) {
            <p class="muted small">No destinations yet.</p>
          }
        }

        @if (draft(); as f) {
          <form class="dest form stack" (ngSubmit)="save()">
            <h3>{{ f.id ? 'Edit' : 'New' }} {{ kindLabel(f.kind) }}</h3>
            <div class="field">
              <label for="n-name">Name</label>
              <input id="n-name" name="name" class="input" [(ngModel)]="f.name" placeholder="e.g. Ops channel" />
              @if (fe()['name']) {
                <span class="error">{{ fe()['name'] }}</span>
              }
            </div>

            @switch (f.kind) {
              @case ('email') {
                <div class="field">
                  <label for="n-to">Send to</label>
                  <textarea id="n-to" name="to" class="input" rows="2" [(ngModel)]="f.to" placeholder="ops@example.org, ada@example.org"></textarea>
                  <span class="hint">Comma- or line-separated. Leave empty to email the workspace's admins and owners.</span>
                </div>
              }
              @case ('telegram') {
                <ol class="steps small">
                  <li>In Telegram, open <strong>&#64;BotFather</strong>, send <code>/newbot</code> and copy the token it gives you.</li>
                  <li>Send your new bot a message, or add it to the group (or as an admin to the channel) that should get the updates.</li>
                  <li>Paste the token and press <em>Find chats</em>.</li>
                </ol>
                <div class="field">
                  <label for="n-token">Bot token</label>
                  <div class="row">
                    <input id="n-token" name="token" class="input mono grow" type="password" autocomplete="off" [(ngModel)]="f.botToken" [placeholder]="f.id ? 'Saved — paste a new one to replace it' : '123456:ABC…'" />
                    <button type="button" class="btn" (click)="findChats()" [disabled]="finding()">
                      @if (finding()) {
                        <span class="spinner"></span>
                      }
                      Find chats
                    </button>
                  </div>
                  @if (fe()['bot_token']) {
                    <span class="error">{{ fe()['bot_token'] }}</span>
                  }
                </div>
                @if (chats(); as c) {
                  <div class="field">
                    <span class="label">Chats &#64;{{ c.bot }} can post to</span>
                    @for (chat of c.chats; track chat.id) {
                      <label class="radio">
                        <input type="radio" name="chat" [checked]="f.chatId === '' + chat.id" (change)="pickChat(chat.id, chat.title)" />
                        {{ chat.title || chat.id }} <span class="muted small">({{ chat.type }})</span>
                      </label>
                    } @empty {
                      <span class="hint warning-text">No chats yet: send the bot a message (or add it to the group), then press Find chats again.</span>
                    }
                  </div>
                }
                <div class="field">
                  <label for="n-chat">Chat id</label>
                  <input id="n-chat" name="chat_id" class="input mono" [(ngModel)]="f.chatId" placeholder="-1001234567890 or @publicchannel" />
                </div>
              }
              @case ('webhook') {
                <div class="field">
                  <label for="n-url">URL</label>
                  <input id="n-url" name="url" class="input mono" type="url" [(ngModel)]="f.url" placeholder="https://n8n.example.org/webhook/markette" />
                  <span class="hint">Markette POSTs JSON with the event in <code>X-Markette-Event</code>, retrying failed deliveries for about 8 hours.</span>
                </div>
              }
            }
            @if (fe()['config']) {
              <span class="error">{{ fe()['config'] }}</span>
            }

            <fieldset class="field">
              <legend class="label">Events</legend>
              <div class="event-grid">
                @for (e of catalog()?.events ?? []; track e.value) {
                  <label class="check">
                    <input type="checkbox" [checked]="f.events.includes(e.value)" (change)="toggleEvent(e.value)" />
                    {{ e.label }}
                  </label>
                }
              </div>
              @if (fe()['events']) {
                <span class="error">{{ fe()['events'] }}</span>
              }
            </fieldset>
            @if (general()) {
              <div class="form-error" role="alert">{{ general() }}</div>
            }
            <div class="row">
              <button type="submit" class="btn primary" [disabled]="saving()">
                @if (saving()) {
                  <span class="spinner"></span>
                }
                {{ f.id ? 'Save' : 'Add' }}
              </button>
              <button type="button" class="btn ghost" (click)="draft.set(null)">Cancel</button>
            </div>
          </form>
        } @else {
          <div class="row-wrap">
            <button type="button" class="btn" (click)="add('telegram')"><app-icon name="send" [size]="16" /> Telegram status bot</button>
            <button type="button" class="btn" (click)="add('webhook')"><app-icon name="zap" [size]="16" /> Webhook</button>
            <button type="button" class="btn" (click)="add('email')" [disabled]="!catalog()?.email_configured" [title]="catalog()?.email_configured ? '' : 'This server has no email settings'">
              <app-icon name="mail" [size]="16" /> Email
            </button>
          </div>
          @if (catalog() && !catalog()!.email_configured) {
            <p class="hint">Email needs an SMTP server, set by the server's administrator (Platform → Settings → Email).</p>
          }
        }
      }
    </section>
  `,
  styles: `
    .dest {
      border: 1px solid var(--border);
      border-radius: var(--radius, 10px);
      padding: 12px 14px;
      display: grid;
      gap: 8px;
    }
    .dest.off {
      opacity: 0.65;
    }
    .dest.form {
      background: var(--surface-2, transparent);
    }
    .kind {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--accent-ink);
      flex: none;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .events {
      gap: 4px;
    }
    .event-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 6px 16px;
    }
    .check,
    .radio {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .steps {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 4px;
    }
    .log {
      width: 100%;
      border-collapse: collapse;
    }
    .log th,
    .log td {
      text-align: left;
      padding: 4px 6px;
      border-top: 1px solid var(--border);
      vertical-align: top;
    }
    .secret {
      flex: 1;
      min-width: 0;
    }
    h3 {
      font-size: 1rem;
    }
  `,
})
export class NotificationsSectionComponent implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly loading = signal(true);
  protected readonly catalog = signal<NotificationCatalog | null>(null);
  protected readonly destinations = signal<NotificationDestination[]>([]);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly saving = signal(false);
  protected readonly busy = signal<number | null>(null);
  protected readonly finding = signal(false);
  protected readonly chats = signal<TelegramChats | null>(null);
  protected readonly secret = signal<{ name: string; value: string } | null>(null);
  protected readonly openLog = signal<number | null>(null);
  protected readonly log = signal<NotificationDelivery[]>([]);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');

  private readonly labels = computed(() => new Map((this.catalog()?.events ?? []).map((e) => [e.value, e.label])));

  ngOnInit() {
    if (!this.ws.isAdmin()) {
      this.loading.set(false);
      return;
    }
    this.api.get<NotificationCatalog>('notifications/catalog/').subscribe({ next: (c) => this.catalog.set(c), error: () => undefined });
    this.reload();
  }

  private reload() {
    this.api.get<NotificationDestination[]>('notifications/').subscribe({
      next: (list) => {
        this.destinations.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load notifications', err);
      },
    });
  }

  protected kindIcon(k: NotificationKind) {
    return KIND_ICON[k];
  }

  protected kindLabel(k: NotificationKind) {
    return { email: 'email destination', telegram: 'Telegram status bot', webhook: 'webhook' }[k];
  }

  protected eventLabel(e: string) {
    return this.labels().get(e) ?? e;
  }

  protected summary(d: NotificationDestination): string {
    if (d.kind === 'email') return d.config.to?.length ? d.config.to.join(', ') : "The workspace's admins and owners";
    if (d.kind === 'telegram') return `Telegram · ${d.config.chat_title || d.config.chat_id}`;
    return d.config.url ?? '';
  }

  protected add(kind: NotificationKind) {
    this.fe.set({});
    this.general.set('');
    this.chats.set(null);
    const names = { email: 'Email', telegram: 'Telegram status', webhook: 'Webhook' };
    this.draft.set({
      id: null,
      kind,
      name: names[kind],
      events: [...(this.catalog()?.default_events ?? [])],
      to: '',
      botToken: '',
      chatId: '',
      chatTitle: '',
      url: '',
    });
  }

  protected edit(d: NotificationDestination) {
    this.fe.set({});
    this.general.set('');
    this.chats.set(null);
    this.draft.set({
      id: d.id,
      kind: d.kind,
      name: d.name,
      events: [...d.events],
      to: (d.config.to ?? []).join(', '),
      botToken: '',
      chatId: d.config.chat_id !== undefined ? String(d.config.chat_id) : '',
      chatTitle: d.config.chat_title ?? '',
      url: d.config.url ?? '',
    });
  }

  protected toggleEvent(value: string) {
    this.draft.update((f) => (f ? { ...f, events: f.events.includes(value) ? f.events.filter((e) => e !== value) : [...f.events, value] } : f));
  }

  protected pickChat(id: number, title: string) {
    this.draft.update((f) => (f ? { ...f, chatId: String(id), chatTitle: title } : f));
  }

  protected findChats() {
    const f = this.draft();
    if (!f) return;
    this.finding.set(true);
    this.fe.set({});
    const body = f.botToken.trim() ? { bot_token: f.botToken.trim() } : { destination: f.id };
    this.api.post<TelegramChats>('notifications/telegram-chats/', body).subscribe({
      next: (c) => {
        this.finding.set(false);
        this.chats.set(c);
        if (c.chats.length === 1 && !f.chatId) this.pickChat(c.chats[0].id, c.chats[0].title);
      },
      error: (err) => {
        this.finding.set(false);
        this.fe.set(fieldErrors(err).fields);
        if (!Object.keys(fieldErrors(err).fields).length) this.toast.error('Could not reach Telegram', err);
      },
    });
  }

  protected save() {
    const f = this.draft();
    if (!f) return;
    const config =
      f.kind === 'email'
        ? { to: f.to.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) }
        : f.kind === 'telegram'
          ? { chat_id: f.chatId.trim(), chat_title: f.chatTitle }
          : { url: f.url.trim() };
    const body: Record<string, unknown> = { kind: f.kind, name: f.name.trim(), events: f.events, config };
    if (f.botToken.trim()) body['bot_token'] = f.botToken.trim();
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    const req = f.id ? this.api.patch<NotificationDestination>(`notifications/${f.id}/`, body) : this.api.post<NotificationDestination>('notifications/', body);
    req.subscribe({
      next: (d) => {
        this.saving.set(false);
        this.draft.set(null);
        if (d.signing_secret) this.secret.set({ name: d.name, value: d.signing_secret });
        this.toast.success(f.id ? 'Saved' : 'Added — send a test to check it');
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        this.general.set(general || (Object.keys(fields).length ? '' : 'Could not save.'));
      },
    });
  }

  protected toggle(d: NotificationDestination) {
    this.api.patch<NotificationDestination>(`notifications/${d.id}/`, { enabled: !d.enabled }).subscribe({
      next: (fresh) => this.destinations.update((list) => list.map((x) => (x.id === fresh.id ? fresh : x))),
      error: (err) => this.toast.error('Could not change it', err),
    });
  }

  protected test(d: NotificationDestination) {
    this.busy.set(d.id);
    this.api.post<NotificationDelivery>(`notifications/${d.id}/test/`).subscribe({
      next: (r) => {
        this.busy.set(null);
        if (r.status === 'sent') this.toast.success('Test sent', `Check ${d.name}.`);
        else this.toast.error('Test not delivered', r.error || 'Unknown error');
        this.reload();
        if (this.openLog() === d.id) this.loadLog(d.id);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Test failed', err);
      },
    });
  }

  protected toggleLog(d: NotificationDestination) {
    if (this.openLog() === d.id) {
      this.openLog.set(null);
      return;
    }
    this.openLog.set(d.id);
    this.loadLog(d.id);
  }

  private loadLog(id: number) {
    this.log.set([]);
    this.api.get<NotificationDelivery[]>(`notifications/${id}/deliveries/`).subscribe({ next: (l) => this.log.set(l), error: () => undefined });
  }

  protected async rotate(d: NotificationDestination) {
    const ok = await this.confirm.ask({
      title: 'Replace the signing secret?',
      message: 'The receiver must be updated with the new secret, or it will reject the next deliveries.',
      confirmLabel: 'Replace it',
    });
    if (!ok) return;
    this.api.post<{ signing_secret: string }>(`notifications/${d.id}/rotate-secret/`).subscribe({
      next: (r) => this.secret.set({ name: d.name, value: r.signing_secret }),
      error: (err) => this.toast.error('Could not replace it', err),
    });
  }

  protected async remove(d: NotificationDestination) {
    const ok = await this.confirm.ask({ title: `Remove ${d.name}?`, message: 'It stops receiving notifications.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    this.api.delete(`notifications/${d.id}/`).subscribe({
      next: () => this.destinations.update((list) => list.filter((x) => x.id !== d.id)),
      error: (err) => this.toast.error('Could not remove it', err),
    });
  }

  protected async copy(text: string) {
    if (await copyText(text)) this.toast.success('Copied');
  }
}
