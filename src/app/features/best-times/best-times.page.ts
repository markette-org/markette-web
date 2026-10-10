import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { BestTimesResponse, ChannelBestTimes } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { HeatmapComponent } from '../../shared/components/heatmap.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';
import { formatHour, weekdayNames } from '../../shared/utils/dates';
import { channelColor } from '../../shared/utils/providers';

const SOURCE: Record<ChannelBestTimes['source'], { label: string; cls: string; hint: string }> = {
  prior: { label: 'Platform defaults', cls: '', hint: 'No publications measured yet: based on typical audience behaviour for this network.' },
  blended: { label: 'Blended', cls: 'info', hint: 'A few of your publications blended with network defaults. Gets sharper as you publish.' },
  data: { label: 'Your data', cls: 'success', hint: 'Learned from how your own audience engaged with your publications.' },
};

@Component({
  selector: 'app-best-times-page',
  imports: [MoreChannelsComponent, RouterLink, HeatmapComponent, IconComponent, ProviderIconComponent, AvatarComponent, EmptyStateComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">Insights</div>
          <h1>Best times to post</h1>
          <p class="subtitle">
            When each audience engages most, hour by hour. Times are in <strong>{{ data()?.timezone || ws.timezone() }}</strong>.
          </p>
        </div>
        <div class="actions">
          @if (ws.canWrite() && channels().length) {
            <button type="button" class="btn" (click)="rebuild()" [disabled]="rebuilding()">
              @if (rebuilding()) {
                <span class="spinner"></span>
              } @else {
                <app-icon name="refresh" [size]="16" />
              }
              Rebuild from latest data
            </button>
          }
        </div>
      </header>

      @if (error()) {
        <div class="form-error" role="alert" style="margin-bottom: 16px">{{ error() }}</div>
      }

      @if (loading()) {
        <div class="grid grid-2">
          <div class="card"><div class="skeleton" style="height: 260px"></div></div>
          <div class="card"><div class="skeleton" style="height: 260px"></div></div>
        </div>
      } @else if (!channels().length) {
        <div class="card">
          <app-empty-state icon="clock" title="No channels yet" text="Connect a channel and Markette will start with each network's typical best times, then learn from your own results.">
            <a routerLink="/channels" class="btn primary">Connect a channel</a>
          </app-empty-state>
        </div>
      } @else {
        @if (channels().length > 1) {
          <div class="filter row-wrap" role="group" aria-label="Show channels">
            <button type="button" class="chip outline" [class.on]="!filter()" [attr.aria-pressed]="!filter()" (click)="filter.set(null)">All channels</button>
            @for (c of relevantBt(); track c.channel) {
              <button type="button" class="chip outline" [class.on]="filter() === c.channel" [attr.aria-pressed]="filter() === c.channel" (click)="filter.set(c.channel)">
                <app-provider-icon [provider]="c.provider" [size]="14" /> {{ c.name }}
              </button>
            }
            <app-more-channels label="More from your organization" hint="" [count]="otherBt().length" [forceOpen]="filterIsOther()">
              <div class="row-wrap">
              @for (c of otherBt(); track c.channel) {
                <button type="button" class="chip outline" [class.on]="filter() === c.channel" [attr.aria-pressed]="filter() === c.channel" (click)="filter.set(c.channel)">
                  <app-provider-icon [provider]="c.provider" [size]="14" /> {{ c.name }}
                </button>
              }
              </div>
            </app-more-channels>
          </div>
        }

        <div class="cards">
          @for (c of visible(); track c.channel) {
            <section class="card bt-card" [attr.aria-label]="c.name + ' best times'">
              <header class="bt-head">
                @if (catalog.channel(c.channel); as ch) {
                  <app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="36" [ring]="color(c)" />
                } @else {
                  <app-provider-icon [provider]="c.provider" [size]="32" />
                }
                <div class="bt-title">
                  <h2>{{ c.name }}</h2>
                  <span class="muted small">
                    {{ c.sample_size }} measured {{ c.sample_size === 1 ? 'publication' : 'publications' }}
                    @if (c.computed_at) {
                      · updated {{ c.computed_at | relTime }}
                    }
                  </span>
                </div>
                <span class="chip {{ source(c).cls }}" [attr.title]="source(c).hint"><span class="dot"></span>{{ source(c).label }}</span>
              </header>

              <div class="bt-body">
                <app-heatmap [scores]="c.scores" [counts]="c.counts" [top]="c.top" [label]="c.name + ' engagement by weekday and hour'" />
                <aside class="top-slots">
                  <h3>Top slots</h3>
                  <ol class="list-reset">
                    @for (t of c.top.slice(0, 6); track $index) {
                      <li>
                        <span class="slot-day">{{ days[t.weekday] }}</span>
                        <span class="slot-hour tabular">{{ hour(t.hour) }}</span>
                        <span class="bar"><span [style.width.%]="t.score"></span></span>
                        <span class="score tabular">{{ round(t.score) }}</span>
                      </li>
                    } @empty {
                      <li class="muted small">No standout slots yet.</li>
                    }
                  </ol>
                  <p class="muted tiny">{{ source(c).hint }}</p>
                </aside>
              </div>
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .filter {
      margin-bottom: 16px;
    }
    .filter .chip {
      height: 30px;
    }
    .filter .chip.on {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent-ink);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .bt-head {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .bt-title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bt-title h2 {
      font-size: 1.05rem;
    }
    .bt-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 230px;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .bt-body {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .top-slots h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .top-slots ol {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    .top-slots li {
      display: grid;
      grid-template-columns: 40px 52px 1fr 26px;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
    }
    .slot-day {
      font-weight: 700;
    }
    .bar {
      height: 6px;
      border-radius: 3px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--accent);
    }
    .score {
      text-align: right;
      color: var(--muted);
      font-size: 0.78rem;
    }
  `,
})
export class BestTimesPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly data = signal<BestTimesResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly rebuilding = signal(false);
  protected readonly error = signal('');
  protected readonly filter = signal<number | null>(null);
  protected readonly days = weekdayNames('short');

  /** Relevant channels first, like everywhere else. */
  protected readonly channels = computed(() => {
    const list = this.data()?.channels ?? [];
    return [...list.filter((c) => this.catalog.isRelevant(c.channel)), ...list.filter((c) => !this.catalog.isRelevant(c.channel))];
  });
  protected readonly relevantBt = computed(() => this.channels().filter((c) => this.catalog.isRelevant(c.channel)));
  protected readonly otherBt = computed(() => this.channels().filter((c) => !this.catalog.isRelevant(c.channel)));
  protected readonly filterIsOther = computed(() => {
    const f = this.filter();
    return f !== null && !this.catalog.isRelevant(f);
  });
  protected readonly visible = computed(() => {
    const f = this.filter();
    return f === null ? this.channels() : this.channels().filter((c) => c.channel === f);
  });

  ngOnInit() {
    this.catalog.loadChannels().subscribe({ error: () => undefined });
    this.api.get<BestTimesResponse>('insights/best-times/').subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatError(err));
      },
    });
  }

  protected rebuild() {
    this.rebuilding.set(true);
    this.api.post<BestTimesResponse>('insights/best-times/rebuild/').subscribe({
      next: (d) => {
        this.data.set(d);
        this.rebuilding.set(false);
        this.toast.success('Best times rebuilt', 'Profiles now include your latest metrics.');
      },
      error: (err) => {
        this.rebuilding.set(false);
        this.toast.error('Could not rebuild', err);
      },
    });
  }

  protected source(c: ChannelBestTimes) {
    return SOURCE[c.source] ?? SOURCE.prior;
  }
  protected color(c: ChannelBestTimes) {
    return channelColor(this.catalog.channel(c.channel) ?? { provider: c.provider });
  }
  protected hour(h: number) {
    return formatHour(h);
  }
  protected round(v: number) {
    return Math.round(v);
  }
}
