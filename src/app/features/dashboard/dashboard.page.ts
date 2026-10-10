import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { AnalyticsOverview, CalendarItem, Post } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ChannelBadgeComponent } from '../../shared/components/channel-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { SparklineComponent } from '../../shared/components/sparkline.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { addDays, formatDayLabel, todayYmd, ymdOf } from '../../shared/utils/dates';
import { channelColor } from '../../shared/utils/providers';

interface DayGroup {
  day: string;
  label: string;
  items: CalendarItem[];
}

@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    IconComponent,
    ProviderIconComponent,
    SparklineComponent,
    StatusChipComponent,
    AvatarComponent,
    ChannelBadgeComponent,
    EmptyStateComponent,
    NumPipe,
    TzDatePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">{{ todayLabel }}</div>
          <h1>{{ greeting() }}</h1>
          <p class="subtitle">Here is what is happening in {{ ws.active()?.name || 'your workspace' }} over the last 30 days.</p>
        </div>
        <div class="actions">
          <a routerLink="/calendar" class="btn"><app-icon name="calendar" [size]="16" /> Calendar</a>
          @if (ws.canWrite()) {
            <a routerLink="/compose" class="btn primary"><app-icon name="plus" [size]="16" /> New post</a>
          }
        </div>
      </header>

      @if (catalog.channelsLoaded() && !catalog.channels().length) {
        <div class="card onboard">
          <app-empty-state icon="channels" title="Connect your first channel" text="Publish to X, Bluesky, Mastodon, LinkedIn, Facebook, Instagram and blogs. Connect an account to start scheduling.">
            <a routerLink="/channels" class="btn primary"><app-icon name="plus" [size]="16" /> Connect a channel</a>
          </app-empty-state>
        </div>
      }

      @if (catalog.needsReauth().length) {
        <div class="notice warning attention-banner" role="status">
          <app-icon name="alert" [size]="18" />
          <div class="stack-sm" style="flex: 1">
            <strong>{{ catalog.needsReauth().length }} {{ catalog.needsReauth().length === 1 ? 'channel needs' : 'channels need' }} reconnecting</strong>
            <div class="row-wrap">
              @for (ch of catalog.needsReauth(); track ch.id) {
                <app-channel-badge [channel]="ch" [size]="22" [showHandle]="false" />
              }
            </div>
          </div>
          <a routerLink="/channels" class="btn sm">Fix now</a>
        </div>
      }

      @if (reviewCount() > 0) {
        <section class="card review-card" aria-labelledby="review-h">
          <div class="card-head">
            <h2 id="review-h" class="row">
              <app-icon name="users" [size]="18" /> Awaiting your review
              <span class="chip warning">{{ reviewCount() }}</span>
            </h2>
            <a routerLink="/posts" [queryParams]="{ review: 'mine' }" class="small">See all</a>
          </div>
          <ul class="list-reset review-list">
            @for (p of reviewPosts(); track p.id) {
              <li>
                <a [routerLink]="['/posts', p.id]" class="review-item">
                  <span class="review-main">
                    <span class="strong truncate">{{ p.title || p.body || 'Untitled post' }}</span>
                    <span class="muted tiny">
                      {{ p.submitted_by_name || p.author_name || 'Someone' }}
                      @if (p.submitted_at) {
                        · {{ p.submitted_at | relTime }}
                      }
                    </span>
                  </span>
                  <span class="row" style="gap: 4px">
                    @for (t of p.targets.slice(0, 5); track t.id) {
                      <app-provider-icon [provider]="t.channel_detail.provider" [size]="16" />
                    }
                  </span>
                  <span class="btn sm">Review</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      <section class="grid grid-4 kpis" aria-label="Key figures, last 30 days">
        <div class="card kpi">
          <span class="kpi-label"><app-icon name="heart" [size]="14" /> Engagements</span>
          <span class="kpi-value">{{ overview()?.totals?.engagements | num }}</span>
          <app-sparkline [values]="engagementSeries()" label="Daily engagements" />
        </div>
        <div class="card kpi">
          <span class="kpi-label"><app-icon name="eye" [size]="14" /> Impressions</span>
          <span class="kpi-value">{{ overview()?.totals?.impressions | num }}</span>
          <app-sparkline [values]="impressionSeries()" color="var(--coral)" label="Daily impressions" />
        </div>
        <div class="card kpi">
          <span class="kpi-label"><app-icon name="send" [size]="14" /> Published</span>
          <span class="kpi-value">{{ overview()?.totals?.posts | num }}</span>
          <app-sparkline [values]="postSeries()" color="var(--success)" label="Daily publications" />
        </div>
        <div class="card kpi">
          <span class="kpi-label"><app-icon name="clock" [size]="14" /> Scheduled</span>
          <span class="kpi-value">{{ overview()?.scheduled | num }}</span>
          <span class="kpi-foot">
            @if (overview()?.failed_last_7d) {
              <span class="danger-text strong">{{ overview()?.failed_last_7d }} failed</span> in the last 7 days
            } @else {
              No failures in the last 7 days
            }
          </span>
        </div>
      </section>
      @if (overviewError()) {
        <p class="danger-text small" role="alert">{{ overviewError() }}</p>
      }

      <div class="grid cols">
        <section class="card" aria-labelledby="upcoming-h">
          <div class="card-head">
            <h2 id="upcoming-h">Upcoming · next 7 days</h2>
            <a routerLink="/calendar" class="small">Open calendar</a>
          </div>
          @if (loadingUpcoming()) {
            <div class="stack">
              <div class="skeleton" style="height: 44px"></div>
              <div class="skeleton" style="height: 44px"></div>
              <div class="skeleton" style="height: 44px"></div>
            </div>
          } @else if (!upcomingGroups().length) {
            <app-empty-state icon="calendar" title="Nothing scheduled this week" text="Schedule a post, add it to the queue, or let us pick the best time.">
              @if (ws.canWrite()) {
                <a routerLink="/compose" class="btn primary sm">Compose a post</a>
              }
            </app-empty-state>
          } @else {
            <div class="stack">
              @for (g of upcomingGroups(); track g.day) {
                <div>
                  <h3 class="day-label">{{ g.label }}</h3>
                  <ul class="list-reset upcoming">
                    @for (it of g.items; track it.id) {
                      <li>
                        <a [routerLink]="['/posts', it.post_id]" class="up-item" [style.--c]="color(it)">
                          <span class="time tabular">{{ it.scheduled_at | tzDate: 'time' }}</span>
                          <app-avatar [src]="it.avatar_url" [name]="it.channel_name" [provider]="it.provider" [size]="28" />
                          <span class="up-text">
                            <span class="strong truncate">{{ it.post_title || it.excerpt || 'Untitled post' }}</span>
                            <span class="muted tiny truncate">{{ it.channel_name }} · {{ it.schedule_reason || 'Scheduled' }}</span>
                          </span>
                          @if (it.thumbnail) {
                            <img class="thumb" [src]="it.thumbnail" alt="" loading="lazy" />
                          }
                        </a>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        </section>

        <section class="card" aria-labelledby="attention-h">
          <div class="card-head">
            <h2 id="attention-h">Needs attention</h2>
            <a routerLink="/posts" [queryParams]="{ status: 'failed' }" class="small">All failures</a>
          </div>
          @if (loadingAttention()) {
            <div class="stack">
              <div class="skeleton" style="height: 56px"></div>
              <div class="skeleton" style="height: 56px"></div>
            </div>
          } @else if (!attention().length) {
            <div class="all-good">
              <span class="ok-ic"><app-icon name="check" [size]="20" /></span>
              <div>
                <strong>All clear</strong>
                <p class="muted small">No failed or partially published posts.</p>
              </div>
            </div>
          } @else {
            <ul class="list-reset stack">
              @for (p of attention(); track p.id) {
                <li class="att-item">
                  <div class="row">
                    <app-status-chip [status]="p.status" />
                    <a [routerLink]="['/posts', p.id]" class="strong truncate" style="flex: 1">{{ p.title || p.body || 'Untitled post' }}</a>
                    <span class="muted tiny">{{ p.updated_at | relTime }}</span>
                  </div>
                  @for (t of failedTargets(p); track t.id) {
                    <div class="err-line">
                      <app-avatar [src]="t.channel_detail.avatar_url" [name]="t.channel_detail.name" [provider]="t.channel_detail.provider" [size]="20" />
                      <span class="small"><strong>{{ t.channel_detail.name }}:</strong> {{ t.last_error || 'Publishing failed.' }}</span>
                    </div>
                  }
                  <div class="row-wrap">
                    @if (ws.canWrite()) {
                      <button type="button" class="btn sm" (click)="retry(p)" [disabled]="retrying() === p.id">
                        @if (retrying() === p.id) {
                          <span class="spinner"></span>
                        } @else {
                          <app-icon name="refresh" [size]="14" />
                        }
                        Retry failed
                      </button>
                      <a [routerLink]="['/posts', p.id, 'edit']" class="btn sm ghost"><app-icon name="edit" [size]="14" /> Edit</a>
                    }
                    <a [routerLink]="['/posts', p.id]" class="btn sm ghost">Details</a>
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      </div>

      @if (catalog.channels().length && !hasAnyPost() && !loadingAttention() && !loadingUpcoming()) {
        <div class="card" style="margin-top: 16px">
          <app-empty-state icon="compose" title="Write your first post" text="Compose once, tailor per network, and schedule it at the best time for each audience.">
            @if (ws.canWrite()) {
              <a routerLink="/compose" class="btn primary">Start composing</a>
            }
          </app-empty-state>
        </div>
      }
    </div>
  `,
  styles: `
    .review-card {
      margin-bottom: 20px;
      border-color: var(--warning);
    }
    .review-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .review-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      color: var(--text);
      text-decoration: none !important;
    }
    .review-item:hover {
      background: var(--surface-hover);
    }
    .review-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .onboard {
      margin-bottom: 20px;
      background: linear-gradient(135deg, var(--accent-soft), var(--surface) 60%);
    }
    .attention-banner {
      margin-bottom: 20px;
      align-items: center;
    }
    .kpis {
      margin-bottom: 16px;
    }
    .kpi app-sparkline {
      margin-top: 6px;
    }
    .cols {
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    }
    @media (max-width: 1000px) {
      .cols {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .day-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .upcoming {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .up-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      border-left: 3px solid var(--c);
      background: var(--surface-2);
      color: var(--text);
      text-decoration: none !important;
    }
    .up-item:hover {
      background: var(--surface-hover);
    }
    .time {
      font-weight: 700;
      font-size: 0.85rem;
      width: 48px;
      flex: none;
    }
    .up-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
      font-size: 0.9rem;
    }
    .thumb {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      object-fit: cover;
      flex: none;
    }
    .att-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .att-item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .err-line {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--text-2);
    }
    .all-good {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 16px 4px;
    }
    .ok-ic {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--success-soft);
      color: var(--success);
    }
  `,
})
export class DashboardPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly posts = inject(PostsService);
  private readonly toast = inject(ToastService);

  protected readonly overview = signal<AnalyticsOverview | null>(null);
  protected readonly overviewError = signal('');
  protected readonly upcoming = signal<CalendarItem[]>([]);
  protected readonly loadingUpcoming = signal(true);
  protected readonly attention = signal<Post[]>([]);
  protected readonly loadingAttention = signal(true);
  protected readonly retrying = signal<number | null>(null);
  protected readonly postCount = signal(0);
  protected readonly reviewPosts = signal<Post[]>([]);
  protected readonly reviewCount = signal(0);

  protected readonly todayLabel = formatDayLabel(todayYmd(this.ws.timezone()), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  protected readonly greeting = computed(() => {
    const name = (this.auth.user()?.name || '').split(' ')[0];
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${part}, ${name}` : part;
  });

  protected readonly engagementSeries = computed(() => this.overview()?.daily.map((d) => d.engagements) ?? []);
  protected readonly impressionSeries = computed(() => this.overview()?.daily.map((d) => d.impressions) ?? []);
  protected readonly postSeries = computed(() => this.overview()?.daily.map((d) => d.posts) ?? []);
  protected readonly hasAnyPost = computed(
    () => this.postCount() > 0 || this.upcoming().length > 0 || this.attention().length > 0 || !!this.overview()?.totals.posts,
  );

  protected readonly upcomingGroups = computed<DayGroup[]>(() => {
    const tz = this.ws.timezone();
    const groups = new Map<string, CalendarItem[]>();
    for (const it of this.upcoming()) {
      if (!it.scheduled_at) continue;
      const day = ymdOf(it.scheduled_at, tz);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(it);
    }
    const today = todayYmd(tz);
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, items]) => ({
        day,
        label: day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : formatDayLabel(day, { weekday: 'long', day: 'numeric', month: 'short' }),
        items: items.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
      }));
  });

  ngOnInit() {
    this.catalog.loadChannels().subscribe({ error: () => undefined });
    const tz = this.ws.timezone();
    const to = todayYmd(tz);
    const from = addDays(to, -29);
    this.api.get<AnalyticsOverview>('analytics/overview/', { from, to }).subscribe({
      next: (o) => this.overview.set(o),
      error: (err) => this.overviewError.set(formatError(err)),
    });

    const now = new Date();
    const end = new Date(now.getTime() + 7 * 86_400_000);
    this.posts.calendar(now.toISOString(), end.toISOString()).subscribe({
      next: (items) => {
        this.upcoming.set(items.filter((i) => i.status === 'scheduled' || i.status === 'queued'));
        this.loadingUpcoming.set(false);
      },
      error: () => this.loadingUpcoming.set(false),
    });

    const empty = { count: 0, next: null, previous: null, results: [] as Post[] };
    forkJoin([
      this.posts.list({ status: 'failed,partial', limit: 8, ordering: '-updated_at' }).pipe(catchError(() => of(empty))),
      this.posts.list({ limit: 1 }).pipe(catchError(() => of(empty))),
      this.posts.list({ review: 'mine', limit: 5, ordering: '-updated_at' }).pipe(catchError(() => of(empty))),
    ]).subscribe(([failing, any, review]) => {
      this.attention.set(failing.results);
      this.reviewPosts.set(review.results);
      this.reviewCount.set(review.count);
      this.postCount.set(any.count);
      this.loadingAttention.set(false);
    });
  }

  protected color(it: CalendarItem): string {
    return channelColor(this.catalog.channel(it.channel) ?? { provider: it.provider });
  }

  protected failedTargets(p: Post) {
    return p.targets.filter((t) => t.status === 'failed');
  }

  protected retry(p: Post) {
    this.retrying.set(p.id);
    this.posts.retry(p.id).subscribe({
      next: (updated) => {
        this.retrying.set(null);
        this.toast.success('Retry queued', 'Failed publications will be sent again shortly.');
        this.attention.update((list) =>
          updated.status === 'failed' || updated.status === 'partial'
            ? list.map((x) => (x.id === updated.id ? updated : x))
            : list.filter((x) => x.id !== updated.id),
        );
      },
      error: (err) => {
        this.retrying.set(null);
        this.toast.error('Could not retry', err);
      },
    });
  }
}
