import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Campaign } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { daysBetween, formatYmd, todayYmd } from '../../shared/utils/dates';
import { CampaignFormComponent } from './campaign-form.component';
import { CampaignPhase, PHASE_CHIP, campaignPhase } from './campaign-utils';

@Component({
  selector: 'app-campaigns-page',
  imports: [RouterLink, FormsModule, IconComponent, EmptyStateComponent, CampaignFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">Plan</div>
          <h1>Campaigns</h1>
          <p class="subtitle">Launches, events and themes that tie your posts together.</p>
        </div>
        <div class="actions">
          @if (catalog.campaigns().length) {
            <div class="segmented" role="tablist" aria-label="Filter campaigns">
              @for (f of filters; track f.key) {
                <button type="button" role="tab" [attr.aria-selected]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
              }
            </div>
          }
          @if (ws.canWrite()) {
            <button type="button" class="btn primary" (click)="openForm(null)"><app-icon name="plus" [size]="16" /> New campaign</button>
          }
        </div>
      </header>

      @if (loading() && !catalog.campaigns().length) {
        <div class="grid grid-auto">
          @for (i of [1, 2, 3]; track i) {
            <div class="card"><div class="skeleton" style="height: 130px"></div></div>
          }
        </div>
      } @else if (loadError()) {
        <div class="card">
          <div class="form-error" role="alert">{{ loadError() }}</div>
          <button type="button" class="btn" style="margin-top: 12px" (click)="load()">Try again</button>
        </div>
      } @else if (!catalog.campaigns().length) {
        <div class="card">
          <app-empty-state
            icon="flag"
            title="No campaigns yet"
            text="Create a campaign for your next launch or event, write a brief, and let Markette plan the posts across your channels."
          >
            @if (ws.canWrite()) {
              <button type="button" class="btn primary" (click)="openForm(null)"><app-icon name="plus" [size]="16" /> Create a campaign</button>
            }
          </app-empty-state>
        </div>
      } @else if (!visible().length) {
        <div class="card"><p class="muted">No {{ filter() }} campaigns.</p></div>
      } @else {
        <div class="grid grid-auto">
          @for (row of visible(); track row.c.id) {
            <article class="card camp" [style.--cc]="row.c.color">
              <div class="row">
                <span class="chip {{ chip[row.phase].cls }}"><span class="dot"></span>{{ chip[row.phase].label }}</span>
                <span class="spacer"></span>
                @if (ws.canWrite()) {
                  <button type="button" class="btn sm icon ghost" (click)="openForm(row.c)" [attr.aria-label]="'Edit ' + row.c.name" title="Edit">
                    <app-icon name="edit" [size]="14" />
                  </button>
                  <button type="button" class="btn sm icon danger-ghost" (click)="remove(row.c)" [attr.aria-label]="'Delete ' + row.c.name" title="Delete">
                    <app-icon name="trash" [size]="14" />
                  </button>
                }
              </div>
              <a [routerLink]="['/campaigns', row.c.id]" class="camp-link">
                <h2 class="truncate">{{ row.c.name }}</h2>
              </a>
              <div class="muted small">
                <app-icon name="calendar" [size]="13" /> {{ fmt(row.c.starts_on) }} – {{ fmt(row.c.ends_on) }} · {{ row.days }} {{ row.days === 1 ? 'day' : 'days' }}
              </div>
              @if (row.c.brief) {
                <p class="brief clamp-2">{{ row.c.brief }}</p>
              } @else {
                <p class="brief muted">No brief yet.</p>
              }
              @if (row.phase === 'running') {
                <div class="progress" role="progressbar" [attr.aria-valuenow]="row.progress" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="row.progress + '% of the campaign period elapsed'">
                  <span [style.width.%]="row.progress"></span>
                </div>
              }
              <div class="camp-foot">
                <span class="strong">{{ row.c.post_count ?? 0 }}</span>
                <span class="muted small">{{ row.c.post_count === 1 ? 'post' : 'posts' }}</span>
                <span class="spacer"></span>
                <a [routerLink]="['/campaigns', row.c.id]" class="btn sm soft">Open <app-icon name="arrowRight" [size]="14" /></a>
              </div>
            </article>
          }
        </div>
      }
    </div>

    <app-campaign-form [open]="formOpen()" [campaign]="editing()" (closed)="formOpen.set(false)" (saved)="onSaved($event)" />
  `,
  styles: `
    .camp {
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      overflow: hidden;
      padding-left: 24px;
    }
    .camp::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 5px;
      background: var(--cc);
    }
    .camp-link {
      color: var(--text);
    }
    .camp-link h2 {
      font-size: 1.1rem;
    }
    .brief {
      font-size: 0.88rem;
      color: var(--text-2);
      min-height: 2.6em;
    }
    .progress {
      height: 5px;
      border-radius: 3px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .progress span {
      display: block;
      height: 100%;
      background: var(--cc);
      border-radius: 3px;
    }
    .camp-foot {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }
  `,
})
export class CampaignsPage implements OnInit {
  protected readonly catalog = inject(CatalogService);
  protected readonly ws = inject(WorkspaceService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  protected readonly chip = PHASE_CHIP;
  protected readonly filters: { key: CampaignPhase | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'ended', label: 'Ended' },
  ];
  protected readonly filter = signal<CampaignPhase | 'all'>('all');
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Campaign | null>(null);

  protected readonly rows = computed(() => {
    const today = todayYmd(this.ws.timezone());
    const order: Record<CampaignPhase, number> = { running: 0, upcoming: 1, ended: 2 };
    return this.catalog
      .campaigns()
      .map((c) => {
        const phase = campaignPhase(c, today);
        const days = daysBetween(c.starts_on, c.ends_on) + 1;
        const elapsed = daysBetween(c.starts_on, today) + 1;
        return { c, phase, days, progress: Math.max(0, Math.min(100, Math.round((elapsed / days) * 100))) };
      })
      .sort(
        (a, b) =>
          order[a.phase] - order[b.phase] ||
          (a.phase === 'ended' ? b.c.ends_on.localeCompare(a.c.ends_on) : a.c.starts_on.localeCompare(b.c.starts_on)),
      );
  });
  protected readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.rows() : this.rows().filter((r) => r.phase === f);
  });

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    this.catalog.loadCampaigns(true).subscribe({
      next: () => this.loading.set(false),
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(formatError(err));
      },
    });
  }

  protected fmt(d: string) {
    return formatYmd(d, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected openForm(c: Campaign | null) {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  protected onSaved(c: Campaign) {
    const created = !this.editing();
    this.formOpen.set(false);
    if (created) this.router.navigate(['/campaigns', c.id]);
  }

  protected async remove(c: Campaign) {
    const ok = await this.confirm.ask({
      title: `Delete “${c.name}”?`,
      message: `The campaign is removed. Its ${c.post_count ?? 0} posts are kept, just no longer grouped under it.`,
      confirmLabel: 'Delete campaign',
      danger: true,
    });
    if (!ok) return;
    this.api.delete(`campaigns/${c.id}/`).subscribe({
      next: () => {
        this.catalog.removeCampaign(c.id);
        this.toast.success('Campaign deleted');
      },
      error: (err) => this.toast.error('Could not delete the campaign', err),
    });
  }
}
