import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Campaign, Post } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { daysBetween, formatYmd, todayYmd } from '../../shared/utils/dates';
import { CampaignFormComponent } from './campaign-form.component';
import { PHASE_CHIP, campaignPhase } from './campaign-utils';
import { PlanWizardComponent } from './plan-wizard.component';

interface PostRow {
  post: Post;
  when: string | null;
  engagements: number;
}

@Component({
  selector: 'app-campaign-detail-page',
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    StatusChipComponent,
    EmptyStateComponent,
    CampaignFormComponent,
    PlanWizardComponent,
    TzDatePipe,
    NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a routerLink="/campaigns" class="back small"><app-icon name="arrowLeft" [size]="14" /> Campaigns</a>

      @if (loadError()) {
        <div class="card">
          <app-empty-state icon="alert" title="Campaign not found" [text]="loadError()">
            <a routerLink="/campaigns" class="btn">Back to campaigns</a>
          </app-empty-state>
        </div>
      } @else if (campaign(); as c) {
        <header class="hero card" [style.--cc]="c.color">
          <div class="hero-main">
            <div class="row-wrap">
              <span class="chip {{ chip[phase()].cls }}"><span class="dot"></span>{{ chip[phase()].label }}</span>
              <span class="muted small">
                <app-icon name="calendar" [size]="13" /> {{ fmt(c.starts_on) }} – {{ fmt(c.ends_on) }} · {{ days() }} days
              </span>
            </div>
            <h1>{{ c.name }}</h1>
            @if (c.brief) {
              <p class="brief pre-wrap" [class.clamp]="!briefOpen()">{{ c.brief }}</p>
              @if (c.brief.length > 280) {
                <button type="button" class="link-btn small" (click)="briefOpen.set(!briefOpen())">{{ briefOpen() ? 'Show less' : 'Show full brief' }}</button>
              }
            } @else {
              <p class="muted">No brief yet. A brief helps the AI planner write on-message posts.</p>
            }
          </div>
          <div class="hero-side">
            <div class="kpis">
              <div class="kpi">
                <span class="kpi-label">Posts</span>
                <span class="kpi-value">{{ posts().length }}</span>
              </div>
              <div class="kpi">
                <span class="kpi-label">Scheduled</span>
                <span class="kpi-value">{{ counts().scheduled }}</span>
              </div>
              <div class="kpi">
                <span class="kpi-label">Published</span>
                <span class="kpi-value">{{ counts().published }}</span>
              </div>
            </div>
            <div class="row-wrap actions">
              @if (ws.canWrite()) {
                @if (ws.aiEnabled()) {
                  <button type="button" class="btn ai" (click)="planOpen.set(true)"><app-icon name="sparkles" [size]="16" /> Plan with AI</button>
                }
                <a class="btn primary" routerLink="/compose" [queryParams]="{ campaign: c.id }"><app-icon name="plus" [size]="16" /> New post</a>
                <button type="button" class="btn" (click)="formOpen.set(true)"><app-icon name="edit" [size]="16" /> Edit</button>
                <button type="button" class="btn icon danger-ghost" (click)="remove(c)" aria-label="Delete campaign" title="Delete campaign">
                  <app-icon name="trash" [size]="16" />
                </button>
              }
              <a class="btn ghost" routerLink="/calendar" [queryParams]="{ campaign: c.id }"><app-icon name="calendar" [size]="16" /> Calendar</a>
            </div>
          </div>
        </header>

        <section class="card flush" style="margin-top: 20px">
          <div class="card-head pad">
            <h2>Posts in this campaign</h2>
            <button type="button" class="btn sm ghost" (click)="loadPosts()" [disabled]="postsLoading()">
              <app-icon name="refresh" [size]="14" /> Refresh
            </button>
          </div>
          @if (postsLoading() && !posts().length) {
            <div class="stack pad">
              @for (i of [1, 2, 3]; track i) {
                <div class="skeleton" style="height: 44px"></div>
              }
            </div>
          } @else if (postsError()) {
            <div class="pad"><div class="form-error">{{ postsError() }}</div></div>
          } @else if (!posts().length) {
            <app-empty-state icon="posts" title="No posts yet" text="Write the first post for this campaign, or let the AI planner draft a whole sequence for you.">
              @if (ws.canWrite()) {
                @if (ws.aiEnabled()) {
                  <button type="button" class="btn ai" (click)="planOpen.set(true)"><app-icon name="sparkles" [size]="16" /> Plan with AI</button>
                }
                <a class="btn" routerLink="/compose" [queryParams]="{ campaign: c.id }">Write a post</a>
              }
            </app-empty-state>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Channels</th>
                    <th>Status</th>
                    <th>When</th>
                    <th class="num">Engagements</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.post.id) {
                    <tr>
                      <td class="title-cell">
                        <a [routerLink]="['/posts', row.post.id]" class="strong truncate d-block">{{ row.post.title || excerpt(row.post) }}</a>
                        @if (row.post.title && row.post.body) {
                          <span class="muted small truncate d-block">{{ excerpt(row.post) }}</span>
                        }
                      </td>
                      <td>
                        <div class="stack-av">
                          @for (t of row.post.targets; track t.id) {
                            <app-avatar [src]="t.channel_detail.avatar_url" [name]="t.channel_detail.name" [provider]="t.channel_detail.provider" [size]="26" [attr.title]="t.channel_detail.name + ' — ' + t.status" />
                          }
                        </div>
                      </td>
                      <td><app-status-chip [status]="row.post.status" /></td>
                      <td class="small nowrap">
                        @if (row.when) {
                          {{ row.when | tzDate: 'short' }}
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="num">{{ row.engagements ? (row.engagements | num) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <app-campaign-form [open]="formOpen()" [campaign]="c" (closed)="formOpen.set(false)" (saved)="onSaved($event)" />
        @if (ws.aiEnabled() && ws.canWrite()) {
          <app-plan-wizard [open]="planOpen()" [campaign]="c" (closed)="planOpen.set(false)" (created)="onPlanned()" />
        }
      } @else {
        <div class="card"><div class="skeleton" style="height: 160px"></div></div>
      }
    </div>
  `,
  styles: `
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: 24px;
      position: relative;
      overflow: hidden;
      border-top: 5px solid var(--cc);
    }
    .hero-main {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .brief {
      color: var(--text-2);
      max-width: 70ch;
    }
    .brief.clamp {
      display: -webkit-box;
      -webkit-line-clamp: 5;
      line-clamp: 5;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .hero-side {
      display: flex;
      flex-direction: column;
      gap: 18px;
      justify-content: space-between;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .actions {
      justify-content: flex-end;
    }
    .pad {
      padding: 16px 20px;
      margin: 0;
    }
    .title-cell {
      max-width: 380px;
    }
    .d-block {
      display: block;
    }
    .nowrap {
      white-space: nowrap;
    }
    .stack-av {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    @media (max-width: 900px) {
      .hero {
        grid-template-columns: minmax(0, 1fr);
      }
      .actions {
        justify-content: flex-start;
      }
    }
  `,
})
export class CampaignDetailPage {
  readonly id = input.required<string>();

  protected readonly ws = inject(WorkspaceService);
  private catalog = inject(CatalogService);
  private api = inject(ApiService);
  private postsApi = inject(PostsService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  protected readonly chip = PHASE_CHIP;
  protected readonly campaign = signal<Campaign | null>(null);
  protected readonly loadError = signal('');
  protected readonly posts = signal<Post[]>([]);
  protected readonly postsLoading = signal(false);
  protected readonly postsError = signal('');
  protected readonly formOpen = signal(false);
  protected readonly planOpen = signal(false);
  protected readonly briefOpen = signal(false);

  protected readonly phase = computed(() => {
    const c = this.campaign();
    return c ? campaignPhase(c, todayYmd(this.ws.timezone())) : 'upcoming';
  });
  protected readonly days = computed(() => {
    const c = this.campaign();
    return c ? daysBetween(c.starts_on, c.ends_on) + 1 : 0;
  });
  protected readonly counts = computed(() => {
    let scheduled = 0;
    let published = 0;
    for (const p of this.posts())
      for (const t of p.targets) {
        if (t.status === 'scheduled' || t.status === 'queued') scheduled++;
        if (t.status === 'published') published++;
      }
    return { scheduled, published };
  });
  protected readonly rows = computed<PostRow[]>(() =>
    this.posts()
      .map((post) => {
        const times = post.targets
          .map((t) => t.published_at || t.scheduled_at)
          .filter((x): x is string => !!x)
          .sort();
        const engagements = post.targets.reduce((n, t) => n + (t.metrics?.engagements ?? 0), 0);
        return { post, when: times[0] ?? null, engagements };
      })
      .sort((a, b) => (a.when ?? '9999').localeCompare(b.when ?? '9999')),
  );

  constructor() {
    this.catalog.loadChannels().subscribe({ error: () => undefined });
    this.catalog.loadProviders().subscribe({ error: () => undefined });
    effect(() => {
      const id = Number(this.id());
      this.load(id);
    });
  }

  private load(id: number) {
    this.loadError.set('');
    const cached = this.catalog.campaignMap().get(id);
    if (cached) this.campaign.set(cached);
    this.api.get<Campaign>(`campaigns/${id}/`).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.catalog.upsertCampaign(c);
      },
      error: (err) => {
        this.campaign.set(null);
        this.loadError.set(formatError(err));
      },
    });
    this.loadPosts(id);
  }

  loadPosts(id = Number(this.id())) {
    this.postsLoading.set(true);
    this.postsError.set('');
    this.postsApi.list({ campaign: id, limit: 100 }).subscribe({
      next: (page) => {
        this.posts.set(page.results);
        this.postsLoading.set(false);
      },
      error: (err) => {
        this.postsLoading.set(false);
        this.postsError.set(formatError(err));
      },
    });
  }

  protected fmt(d: string) {
    return formatYmd(d, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected excerpt(p: Post): string {
    const text = (p.body || p.targets.find((t) => t.body)?.body || '').replace(/\s+/g, ' ').trim();
    return text.length > 90 ? text.slice(0, 90) + '…' : text || 'Untitled post';
  }

  protected onSaved(c: Campaign) {
    this.formOpen.set(false);
    this.campaign.set(c);
  }

  protected onPlanned() {
    this.loadPosts();
    this.catalog.loadCampaigns(true).subscribe({
      next: () => {
        const c = this.catalog.campaignMap().get(Number(this.id()));
        if (c) this.campaign.set(c);
      },
      error: () => undefined,
    });
  }

  protected async remove(c: Campaign) {
    const ok = await this.confirm.ask({
      title: `Delete “${c.name}”?`,
      message: `The campaign is removed. Its ${this.posts().length} posts are kept, just no longer grouped under it.`,
      confirmLabel: 'Delete campaign',
      danger: true,
    });
    if (!ok) return;
    this.api.delete(`campaigns/${c.id}/`).subscribe({
      next: () => {
        this.catalog.removeCampaign(c.id);
        this.toast.success('Campaign deleted');
        this.router.navigateByUrl('/campaigns');
      },
      error: (err) => this.toast.error('Could not delete the campaign', err),
    });
  }
}
