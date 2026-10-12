import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { InboxService } from '../../core/inbox.service';
import { Id, InboxItem } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';

type Filter = 'open' | 'new' | 'done' | 'all';

const KIND_LABEL: Record<string, string> = { reply: 'replied', mention: 'mentioned you', comment: 'commented', quote: 'quoted you' };

@Component({
  selector: 'app-inbox-page',
  imports: [FormsModule, RouterLink, IconComponent, ProviderIconComponent, AvatarComponent, EmptyStateComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">Conversations</div>
          <h1>Inbox</h1>
          <p class="subtitle">Replies, mentions and comments on your channels, collected every few minutes. Answer them here or on the network.</p>
        </div>
        <div class="actions">
          <button type="button" class="btn" (click)="refreshNow()" [disabled]="refreshing()">
            @if (refreshing()) {
              <span class="spinner"></span>
            } @else {
              <app-icon name="refresh" [size]="16" />
            }
            Check now
          </button>
        </div>
      </header>

      @for (c of problems(); track c.channel) {
        <div class="notice warning small"><app-icon name="alert" [size]="16" /><span><strong>{{ c.name }}:</strong> {{ c.last_error }}</span></div>
      }

      <div class="card tight filters" role="group" aria-label="Filters">
        <div class="segmented" role="group" aria-label="Status">
          @for (f of filters; track f.value) {
            <button type="button" [attr.aria-pressed]="filter() === f.value" (click)="setFilter(f.value)">{{ f.label }}</button>
          }
        </div>
        <select class="select sm" [ngModel]="channel()" (ngModelChange)="setChannel($event)" aria-label="Channel">
          <option [ngValue]="null">All channels</option>
          @for (c of inbox.summary()?.channels ?? []; track c.channel) {
            <option [ngValue]="c.channel">{{ c.name }}</option>
          }
        </select>
        <input class="input sm grow" type="search" placeholder="Search text or author" [ngModel]="q()" (ngModelChange)="setQuery($event)" aria-label="Search" />
        @if (items().length && filter() !== 'done') {
          <button type="button" class="btn sm ghost" (click)="markAll()">Mark all as read</button>
        }
      </div>

      @if (loading() && !items().length) {
        <div class="row"><span class="spinner"></span> Loading…</div>
      } @else if (!items().length) {
        <app-empty-state icon="inbox" title="Nothing here" [text]="emptyMessage()" />
      } @else {
        <ul class="list-reset stack">
          @for (it of items(); track it.id) {
            <li class="card item" [class.unread]="it.status === 'new'">
              <div class="row">
                <app-avatar [src]="it.author_avatar" [name]="it.author_name || it.author_handle" [provider]="it.provider" [size]="36" />
                <div class="grow">
                  <div class="row-wrap who">
                    @if (it.author_url) {
                      <a [href]="it.author_url" target="_blank" rel="noopener" class="strong">{{ it.author_name || it.author_handle }}</a>
                    } @else {
                      <strong>{{ it.author_name || it.author_handle }}</strong>
                    }
                    @if (it.author_handle && it.author_name) {
                      <span class="muted small">{{ it.author_handle }}</span>
                    }
                    <span class="muted small">{{ kindLabel(it.kind) }} on</span>
                    <span class="row small"><app-provider-icon [provider]="it.provider" [size]="14" /> {{ it.channel_name }}</span>
                    <span class="spacer"></span>
                    @if (it.remote_created_at) {
                      <span class="tiny muted">{{ it.remote_created_at | relTime }}</span>
                    }
                  </div>
                  @if (it.post) {
                    <a class="small muted" [routerLink]="['/posts', it.post]">Re: {{ it.post_title || 'your post' }}</a>
                  }
                </div>
              </div>
              <p class="pre-wrap text">{{ it.text }}</p>
              @if (it.reply_text) {
                <div class="reply small">
                  <app-icon name="send" [size]="14" />
                  <span><strong>{{ it.replied_by_name || 'You' }}</strong> answered: {{ it.reply_text }}</span>
                </div>
              }
              @if (replying() === it.id) {
                <form class="stack-sm" (ngSubmit)="send(it)">
                  <textarea class="textarea" rows="3" name="reply" [(ngModel)]="draft" [attr.aria-label]="'Reply to ' + (it.author_name || it.author_handle)" required></textarea>
                  <div class="row">
                    <button type="submit" class="btn sm primary" [disabled]="sending() || !draft.trim()">
                      @if (sending()) {
                        <span class="spinner"></span>
                      }
                      Send reply
                    </button>
                    <button type="button" class="btn sm ghost" (click)="replying.set(null)">Cancel</button>
                  </div>
                </form>
              }
              <div class="row-wrap actions-row">
                @if (it.can_reply && ws.canWrite() && replying() !== it.id) {
                  <button type="button" class="btn sm" (click)="startReply(it)"><app-icon name="message" [size]="14" /> Reply</button>
                }
                @if (it.url) {
                  <a class="btn sm ghost" [href]="it.url" target="_blank" rel="noopener"><app-icon name="external" [size]="14" /> {{ it.can_reply ? 'Open' : 'Answer on the network' }}</a>
                }
                <span class="spacer"></span>
                @if (it.status !== 'done') {
                  <button type="button" class="btn sm ghost" (click)="mark([it.id], 'done')"><app-icon name="check" [size]="14" /> Done</button>
                } @else {
                  <button type="button" class="btn sm ghost" (click)="mark([it.id], 'new')">Reopen</button>
                }
                @if (it.status === 'new') {
                  <button type="button" class="btn sm ghost" (click)="mark([it.id], 'read')">Mark read</button>
                }
              </div>
            </li>
          }
        </ul>
        @if (next()) {
          <div class="row" style="justify-content: center"><button type="button" class="btn" (click)="more()">Load more</button></div>
        }
      }
    </div>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
    }
    .filters .select {
      width: auto;
      min-width: 180px;
    }
    .filters .input {
      flex: 1 1 200px;
      width: auto;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .item {
      display: grid;
      gap: 8px;
    }
    .item.unread {
      border-left: 3px solid var(--accent);
    }
    .who {
      gap: 6px;
      align-items: baseline;
    }
    .text {
      margin: 0;
    }
    .reply {
      display: flex;
      gap: 6px;
      color: var(--text-2);
      background: var(--surface-2);
      border-radius: 8px;
      padding: 8px 10px;
    }
  `,
})
export class InboxPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly inbox = inject(InboxService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'new', label: 'Unread' },
    { value: 'done', label: 'Done' },
    { value: 'all', label: 'All' },
  ];
  protected readonly filter = signal<Filter>('open');
  protected readonly channel = signal<Id | null>(null);
  protected readonly q = signal('');
  protected readonly items = signal<InboxItem[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly replying = signal<Id | null>(null);
  protected readonly sending = signal(false);
  protected draft = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly problems = computed(() => (this.inbox.summary()?.channels ?? []).filter((c) => c.last_error));
  protected readonly emptyMessage = computed(() =>
    (this.inbox.summary()?.channels ?? []).length
      ? 'New replies, mentions and comments on your channels appear here.'
      : 'None of your channels can share replies yet. Connect Mastodon, Bluesky, Facebook, Instagram, Threads, YouTube, Reddit, WordPress or a LinkedIn page.',
  );

  ngOnInit() {
    this.inbox.refresh();
    this.load();
  }

  private load(append = false) {
    this.loading.set(true);
    const offset = append ? this.items().length : 0;
    this.api.page<InboxItem>('inbox/', { status: this.filter(), channel: this.channel(), q: this.q().trim(), limit: 30, offset }).subscribe({
      next: (page) => {
        this.items.set(append ? [...this.items(), ...page.results] : page.results);
        this.next.set(page.next);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load the inbox', err);
      },
    });
  }

  protected more() {
    this.load(true);
  }

  protected setFilter(f: Filter) {
    this.filter.set(f);
    this.load();
  }

  protected setChannel(c: Id | null) {
    this.channel.set(c);
    this.load();
  }

  protected setQuery(v: string) {
    this.q.set(v);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  protected kindLabel(k: string) {
    return KIND_LABEL[k] ?? k;
  }

  protected startReply(it: InboxItem) {
    this.draft = '';
    this.replying.set(it.id);
    if (it.status === 'new') this.mark([it.id], 'read', true);
  }

  protected send(it: InboxItem) {
    this.sending.set(true);
    this.api.post<InboxItem>(`inbox/${it.id}/reply/`, { text: this.draft.trim() }).subscribe({
      next: (fresh) => {
        this.sending.set(false);
        this.replying.set(null);
        this.items.update((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
        this.toast.success(`Reply sent on ${it.channel_name}`);
        this.inbox.refresh();
      },
      error: (err) => {
        this.sending.set(false);
        this.toast.error('Reply not sent', err);
      },
    });
  }

  protected mark(ids: Id[], status: InboxItem['status'], quiet = false) {
    this.api.post('inbox/mark/', { ids, status }).subscribe({
      next: () => {
        const hide = (this.filter() === 'open' && status === 'done') || (this.filter() === 'new' && status !== 'new') || (this.filter() === 'done' && status !== 'done');
        this.items.update((list) => (hide && !quiet ? list.filter((x) => !ids.includes(x.id)) : list.map((x) => (ids.includes(x.id) ? { ...x, status } : x))));
        this.inbox.refresh();
      },
      error: (err) => this.toast.error('Could not update', err),
    });
  }

  protected markAll() {
    this.mark(
      this.items()
        .filter((i) => i.status === 'new')
        .map((i) => i.id),
      'read',
    );
  }

  protected refreshNow() {
    this.refreshing.set(true);
    this.api.post<{ polling: number }>('inbox/refresh/').subscribe({
      next: () => {
        // Polling runs in the background: look again in a few seconds.
        setTimeout(() => {
          this.refreshing.set(false);
          this.inbox.refresh();
          this.load();
        }, 4000);
      },
      error: (err) => {
        this.refreshing.set(false);
        this.toast.error('Could not check now', err);
      },
    });
  }
}
