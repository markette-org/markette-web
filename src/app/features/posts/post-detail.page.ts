import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Id, Metrics, Post, Target, TargetAnalytics, ValidationProblems } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ChannelBadgeComponent } from '../../shared/components/channel-badge.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { LineChartComponent, LineSeries } from '../../shared/components/line-chart.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe, PctPipe } from '../../shared/pipes/num.pipe';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { formatInTz } from '../../shared/utils/dates';
import { fmtBytes } from '../../shared/utils/format';
import { channelColor } from '../../shared/utils/providers';
import { ApprovalChipComponent } from './approval-chip.component';
import { ApprovalPanelComponent } from './approval-panel.component';
import { postTotals } from './post-utils';

const METRIC_KEYS = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks', 'engagements'] as const;
const MODE_LABEL: Record<string, string> = {
  exact: 'At a specific time',
  queue: 'Next queue slot',
  best_time: 'Best time per channel',
  now: 'Immediately',
};

@Component({
  selector: 'app-post-detail-page',
  imports: [
    RouterLink,
    IconComponent,
    ChannelBadgeComponent,
    StatusChipComponent,
    EmptyStateComponent,
    LineChartComponent,
    TzDatePipe,
    RelativeTimePipe,
    NumPipe,
    PctPipe,
    ApprovalChipComponent,
    ApprovalPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-detail.page.html',
  styleUrl: './post-detail.page.scss',
})
export class PostDetailPage {
  readonly id = input<string>();

  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly posts = inject(PostsService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  protected readonly post = signal<Post | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly problems = signal<ValidationProblems>({});
  protected readonly analytics = signal<Record<number, TargetAnalytics>>({});
  protected readonly refreshing = signal<Id | null>(null);
  protected readonly busy = signal(false);

  protected readonly modeLabel = MODE_LABEL;

  /** False for destinations that report no metrics at all (e.g. Hugo). */
  protected measurable(t: Target): boolean {
    return this.catalog.provider(t.channel_detail.provider)?.has_metrics !== false;
  }
  protected readonly fmtBytes = fmtBytes;

  protected readonly totals = computed(() => {
    const p = this.post();
    return p ? postTotals(p) : null;
  });
  protected readonly campaign = computed(() => {
    const p = this.post();
    return p?.campaign ? this.catalog.campaignMap().get(p.campaign) : undefined;
  });
  protected readonly showApproval = computed(() => {
    const p = this.post();
    return !!p && (!!p.approval_status || !!p.needs_approval || !!p.can_review);
  });
  protected readonly hasFailed = computed(() => !!this.post()?.targets.some((t) => t.status === 'failed'));
  protected readonly problemCount = computed(() => Object.values(this.problems()).reduce((n, l) => n + l.length, 0));
  protected readonly editable = computed(() => {
    const p = this.post();
    return !!p && this.ws.canWrite() && p.status !== 'publishing';
  });
  protected readonly xFormat = (x: number) =>
    formatInTz(x, this.ws.timezone(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  constructor() {
    this.catalog.loadProviders().subscribe({ error: () => undefined });
    this.catalog.loadCampaigns().subscribe({ error: () => undefined });
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(id: string | undefined) {
    const n = Number(id);
    if (!id || !Number.isFinite(n)) {
      this.loading.set(false);
      this.error.set('This post does not exist.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.posts.get(n).subscribe({
      next: (p) => {
        this.setPost(p);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatError(err));
      },
    });
  }

  protected onApprovalChanged(p: Post) {
    this.setPost(p);
  }

  private setPost(p: Post) {
    this.post.set(p);
    if (p.status !== 'published' && p.targets.length) {
      this.posts.validate(p.id).subscribe({ next: (r) => this.problems.set(r ?? {}), error: () => this.problems.set({}) });
    } else {
      this.problems.set({});
    }
    for (const t of p.targets) {
      if (t.status === 'published' && !this.analytics()[t.id]) this.loadAnalytics(t.id);
    }
  }

  private loadAnalytics(targetId: Id) {
    this.api.get<TargetAnalytics>(`analytics/targets/${targetId}/`).subscribe({
      next: (a) => this.analytics.update((m) => ({ ...m, [targetId]: a })),
      error: () => undefined,
    });
  }

  /* --- view helpers ---------------------------------------------------------- */

  /** Network-specific names for generic metric keys (WhatsApp: delivered / read). */
  protected metricLabel(t: Target, key: string): string {
    const p = t.channel_detail?.provider;
    if (p === 'whatsapp') {
      if (key === 'impressions') return 'Delivered';
      if (key === 'reach') return 'Read';
    } else if (p === 'brevo' || p === 'listmonk') {
      if (key === 'impressions') return p === 'brevo' ? 'Delivered' : 'Sent';
      if (key === 'reach') return 'Opened';
      if (key === 'clicks') return 'Clicked';
    } else if (p === 'ghost') {
      if (key === 'impressions') return 'Delivered emails';
      if (key === 'reach') return 'Opened';
    }
    if (p === 'reddit' && key === 'likes') return 'Score';
    return key === 'impressions' ? 'Impressions' : key;
  }

  /** Provider extras worth showing as chips (YouTube visibility, Ghost email). */
  protected extraChips(t: Target): { label: string; cls: string }[] {
    const out: { label: string; cls: string }[] = [];
    const privacy = t.extra?.['privacy'];
    if (typeof privacy === 'string' && privacy) out.push({ label: `Visibility: ${privacy}`, cls: privacy === 'public' ? 'success' : 'warning' });
    if (t.extra?.['emailed'] === true) out.push({ label: 'Emailed to members', cls: 'accent' });
    return out;
  }

  /** extra.note, unless already shown through the "Published, but …" warning. */
  protected extraNote(t: Target): string {
    const note = t.extra?.['note'];
    if (typeof note !== 'string' || !note) return '';
    return (t.last_error ?? '').toLowerCase().includes(note.slice(1).toLowerCase()) ? '' : note;
  }

  /** WhatsApp broadcast delivery counts stored in target.extra. */
  protected sendStats(t: Target): { sent: number; failed: number } | null {
    const sent = t.extra?.['sent'];
    const failed = t.extra?.['failed'];
    if (typeof sent !== 'number' && typeof failed !== 'number') return null;
    return { sent: typeof sent === 'number' ? sent : 0, failed: typeof failed === 'number' ? failed : 0 };
  }

  protected metricTiles(m: Metrics | null | undefined): { key: string; value: number }[] {
    if (!m) return [];
    return METRIC_KEYS.map((k) => ({ key: k, value: m[k] })).filter(
      (e): e is { key: (typeof METRIC_KEYS)[number]; value: number } => typeof e.value === 'number',
    );
  }

  protected series(t: Target, key: 'engagements' | 'impressions'): LineSeries[] {
    const a = this.analytics()[t.id];
    if (!a?.series?.length) return [];
    const points = a.series
      .filter((s) => typeof s[key] === 'number')
      .map((s) => ({ x: Date.parse(s.captured_at), y: s[key] as number }))
      .sort((p, q) => p.x - q.x);
    return points.length ? [{ name: key === 'engagements' ? 'Engagements' : this.metricLabel(t, 'impressions'), color: channelColor(t.channel_detail), points }] : [];
  }

  protected targetProblems(t: Target): string[] {
    return this.problems()[String(t.id)] ?? [];
  }

  protected canCancel(t: Target): boolean {
    return this.ws.canWrite() && ['draft', 'scheduled', 'failed'].includes(t.status);
  }

  protected canDeleteRemote(t: Target): boolean {
    return this.ws.isAdmin() && t.status === 'published';
  }

  protected optionEntries(t: Target): { key: string; value: string }[] {
    return Object.entries(t.options ?? {})
      .filter(([k]) => k !== 'first_comment' && k !== 'links_in_first_comment')
      .filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => ({ key: k.replace(/_/g, ' '), value: Array.isArray(v) ? v.join(', ') : String(v) }));
  }

  /** "Published, but the first comment could not be posted: …" is a warning, not a failure. */
  protected isSoftError(t: Target): boolean {
    return /^Published, but/i.test(t.last_error ?? '');
  }

  /* --- post actions ---------------------------------------------------------- */

  private act(call: () => Observable<Post>, success: string) {
    if (this.busy()) return;
    this.busy.set(true);
    call().subscribe({
      next: (p) => {
        this.busy.set(false);
        this.setPost(p);
        this.toast.success(success);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Action failed', err);
      },
    });
  }

  protected retry() {
    const p = this.post();
    if (p) this.act(() => this.posts.retry(p.id), 'Retrying failed publications');
  }

  protected unschedule() {
    const p = this.post();
    if (p) this.act(() => this.posts.unschedule(p.id), 'Post unscheduled');
  }

  protected duplicate() {
    const p = this.post();
    if (!p || this.busy()) return;
    this.busy.set(true);
    this.posts.duplicate(p.id).subscribe({
      next: (copy) => {
        this.busy.set(false);
        this.toast.success('Post duplicated');
        this.router.navigate(['/posts', copy.id, 'edit']);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Could not duplicate', err);
      },
    });
  }

  protected async remove() {
    const p = this.post();
    if (!p) return;
    const ok = await this.confirm.ask({
      title: 'Delete this post?',
      message: p.targets.some((t) => t.status === 'published')
        ? 'The post is removed here. Copies already published on the networks stay online.'
        : 'The post and its scheduled publications are removed. This cannot be undone.',
      confirmLabel: 'Delete post',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.posts.remove(p.id).subscribe({
      next: () => {
        this.toast.success('Post deleted');
        this.router.navigateByUrl('/posts');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Could not delete', err);
      },
    });
  }

  /* --- target actions -------------------------------------------------------- */

  private patchTarget(t: Target) {
    this.post.update((p) => (p ? { ...p, targets: p.targets.map((x) => (x.id === t.id ? { ...x, ...t } : x)) } : p));
  }

  private reloadQuietly() {
    const p = this.post();
    if (p) this.posts.get(p.id).subscribe({ next: (fresh) => this.setPost(fresh), error: () => undefined });
  }

  protected async cancelTarget(t: Target) {
    const ok = await this.confirm.ask({
      title: `Cancel the ${t.channel_detail.name} publication?`,
      message: 'It will not be published on this channel. Other channels are not affected.',
      confirmLabel: 'Cancel publication',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    this.posts.cancelTarget(t.id).subscribe({
      next: (res) => {
        this.patchTarget(res);
        this.toast.success('Publication cancelled');
        this.reloadQuietly();
      },
      error: (err) => this.toast.error('Could not cancel', err),
    });
  }

  protected async deleteRemote(t: Target) {
    const ok = await this.confirm.ask({
      title: `Delete from ${t.channel_detail.provider_label}?`,
      message: `This removes the published post from ${t.channel_detail.name} on the network itself. Likes, comments and shares there are lost.`,
      confirmLabel: 'Delete from network',
      danger: true,
    });
    if (!ok) return;
    this.posts.deleteRemote(t.id).subscribe({
      next: (res) => {
        this.patchTarget(res);
        this.toast.success('Deleted from the network');
        this.reloadQuietly();
      },
      error: (err) => this.toast.error('Could not delete from the network', err),
    });
  }

  protected refreshMetrics(t: Target) {
    this.refreshing.set(t.id);
    this.api.post<{ target: Id; metrics: Metrics }>(`analytics/targets/${t.id}/refresh/`).subscribe({
      next: (r) => {
        this.refreshing.set(null);
        this.patchTarget({ ...t, metrics: r.metrics ?? t.metrics, metrics_updated_at: new Date().toISOString() });
        this.loadAnalytics(t.id);
        this.toast.success('Metrics refreshed');
      },
      error: (err) => {
        this.refreshing.set(null);
        this.toast.error('Could not refresh metrics', err);
      },
    });
  }
}
