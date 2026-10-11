import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Id, Post, PostStatus, Target } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe } from '../../shared/pipes/num.pipe';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { formatInTz } from '../../shared/utils/dates';
import { ApprovalChipComponent } from './approval-chip.component';
import { postTotals, targetTooltip } from './post-utils';

export type ReviewView = '' | 'mine' | 'pending' | 'changes_requested';
const VIEWS: { value: ReviewView; label: string }[] = [
  { value: '', label: 'All posts' },
  { value: 'mine', label: 'Awaiting my review' },
  { value: 'pending', label: 'Pending review' },
  { value: 'changes_requested', label: 'Changes requested' },
];

const PAGE = 20;
const STATUSES: { value: PostStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'publishing', label: 'Publishing' },
  { value: 'published', label: 'Published' },
  { value: 'partial', label: 'Partially published' },
  { value: 'unconfirmed', label: 'Needs checking' },
  { value: 'failed', label: 'Failed' },
];

@Component({
  selector: 'app-posts-page',
  imports: [
    RouterLink,
    IconComponent,
    ProviderIconComponent,
    StatusChipComponent,
    EmptyStateComponent,
    NumPipe,
    TzDatePipe,
    RelativeTimePipe,
    ApprovalChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './posts.page.html',
  styleUrl: './posts.page.scss',
})
export class PostsPage implements OnInit, OnDestroy {
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly posts = inject(PostsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statuses = STATUSES;
  protected readonly views = VIEWS;
  protected readonly view = signal<ReviewView>('');
  protected readonly status = signal<string>('');
  protected readonly channel = signal<string>('');
  protected readonly campaign = signal<string>('');
  protected readonly search = signal('');
  protected readonly offset = signal(0);

  protected readonly rows = signal<Post[]>([]);
  protected readonly count = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<Id | null>(null);

  protected readonly hasFilters = computed(() => !!(this.view() || this.status() || this.channel() || this.campaign() || this.search()));
  protected readonly pageLabel = computed(() => {
    const c = this.count();
    if (!c) return '';
    return `${this.offset() + 1}–${Math.min(this.offset() + PAGE, c)} of ${c}`;
  });
  protected readonly hasPrev = computed(() => this.offset() > 0);
  protected readonly hasNext = computed(() => this.offset() + PAGE < this.count());

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private reqSeq = 0;

  protected readonly totals = postTotals;
  protected readonly tooltip = (t: Target) => targetTooltip(t, this.ws.timezone());

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    this.status.set(q.get('status') ?? '');
    const approval = q.get('approval');
    this.view.set(q.get('review') === 'mine' ? 'mine' : approval === 'pending' || approval === 'changes_requested' ? approval : '');
    this.channel.set(q.get('channel') ?? '');
    this.campaign.set(q.get('campaign') ?? '');
    this.search.set(q.get('search') ?? '');
    this.catalog.ensureAll();
    this.load();
  }

  @HostListener('document:click', ['$event'])
  protected closeMenus(e: MouseEvent) {
    const target = e.target as HTMLElement;
    document.querySelectorAll('details.more[open]').forEach((d) => {
      if (!d.contains(target)) d.removeAttribute('open');
    });
  }

  ngOnDestroy() {
    clearTimeout(this.searchTimer);
  }

  protected load() {
    const seq = ++this.reqSeq;
    this.loading.set(true);
    this.error.set('');
    this.posts
      .list({
        status: this.status(),
        channel: this.channel(),
        campaign: this.campaign(),
        search: this.search().trim(),
        limit: PAGE,
        offset: this.offset(),
        ordering: '-updated_at',
        review: this.view() === 'mine' ? 'mine' : null,
        approval: this.view() === 'pending' || this.view() === 'changes_requested' ? this.view() : null,
      })
      .subscribe({
        next: (page) => {
          if (seq !== this.reqSeq) return;
          this.rows.set(page.results);
          this.count.set(page.count);
          this.loading.set(false);
        },
        error: (err) => {
          if (seq !== this.reqSeq) return;
          this.loading.set(false);
          this.error.set(formatError(err));
        },
      });
  }

  private syncUrl() {
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        status: this.status() || null,
        channel: this.channel() || null,
        campaign: this.campaign() || null,
        search: this.search().trim() || null,
        review: this.view() === 'mine' ? 'mine' : null,
        approval: this.view() === 'pending' || this.view() === 'changes_requested' ? this.view() : null,
      },
    });
  }

  protected setFilter(which: 'status' | 'channel' | 'campaign', value: string) {
    this[which].set(value);
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected setView(v: ReviewView) {
    if (v === this.view()) return;
    this.view.set(v);
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.offset.set(0);
      this.syncUrl();
      this.load();
    }, 300);
  }

  protected clearFilters() {
    this.view.set('');
    this.status.set('');
    this.channel.set('');
    this.campaign.set('');
    this.search.set('');
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected page(dir: 1 | -1) {
    this.offset.update((o) => Math.max(0, o + dir * PAGE));
    this.load();
  }

  /* --- row helpers ----------------------------------------------------------- */

  protected excerpt(p: Post): string {
    const text = p.title || p.body || p.targets.find((t) => t.body)?.body || '';
    return text.length > 160 ? text.slice(0, 160) + '…' : text;
  }

  protected thumb(p: Post): string | null {
    return p.media.find((m) => m.mime.startsWith('image/'))?.url ?? null;
  }

  protected hasVideo(p: Post): boolean {
    return p.media.some((m) => m.mime.startsWith('video/'));
  }

  protected hasFailed(p: Post): boolean {
    return p.targets.some((t) => t.status === 'failed');
  }

  protected nextTime(p: Post): string {
    const times = p.targets
      .filter((t) => t.status === 'scheduled' && t.scheduled_at)
      .map((t) => t.scheduled_at as string)
      .sort();
    return times.length ? formatInTz(times[0], this.ws.timezone(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  }

  protected approvalTitle(p: Post): string {
    if (p.approval_status === 'pending') return p.submitted_by_name ? `Submitted by ${p.submitted_by_name}` : 'Waiting for a reviewer';
    if (p.reviewed_by_name) return `Reviewed by ${p.reviewed_by_name}`;
    return '';
  }

  protected editable(p: Post): boolean {
    return this.ws.canWrite() && p.status !== 'publishing';
  }

  /* --- actions --------------------------------------------------------------- */

  private run(p: Post, action: () => void) {
    if (this.busy()) return;
    this.busy.set(p.id);
    action();
  }

  private done() {
    this.busy.set(null);
  }

  private replace(p: Post) {
    this.rows.update((list) => list.map((x) => (x.id === p.id ? p : x)));
  }

  protected duplicate(p: Post) {
    this.run(p, () =>
      this.posts.duplicate(p.id).subscribe({
        next: (copy) => {
          this.done();
          this.toast.success('Post duplicated', 'Opening the copy so you can adjust it.');
          this.router.navigate(['/posts', copy.id, 'edit']);
        },
        error: (err) => {
          this.done();
          this.toast.error('Could not duplicate', err);
        },
      }),
    );
  }

  protected retry(p: Post) {
    this.run(p, () =>
      this.posts.retry(p.id).subscribe({
        next: (fresh) => {
          this.done();
          this.replace(fresh);
          this.toast.success('Retrying failed publications', 'They will go out within a minute.');
        },
        error: (err) => {
          this.done();
          this.toast.error('Could not retry', err);
        },
      }),
    );
  }

  protected unschedule(p: Post) {
    this.run(p, () =>
      this.posts.unschedule(p.id).subscribe({
        next: (fresh) => {
          this.done();
          this.replace(fresh);
          this.toast.success('Unscheduled', 'The post is back in drafts.');
        },
        error: (err) => {
          this.done();
          this.toast.error('Could not unschedule', err);
        },
      }),
    );
  }

  protected async remove(p: Post) {
    const published = p.targets.some((t) => t.status === 'published');
    const ok = await this.confirm.ask({
      title: 'Delete this post?',
      message: published
        ? 'The post is removed here. Copies already published on the networks stay online.'
        : 'The post and its scheduled publications are removed. This cannot be undone.',
      confirmLabel: 'Delete post',
      danger: true,
    });
    if (!ok) return;
    this.run(p, () =>
      this.posts.remove(p.id).subscribe({
        next: () => {
          this.done();
          this.rows.update((list) => list.filter((x) => x.id !== p.id));
          this.count.update((c) => Math.max(0, c - 1));
          this.toast.success('Post deleted');
          if (!this.rows().length && this.offset() > 0) this.page(-1);
        },
        error: (err) => {
          this.done();
          this.toast.error('Could not delete', err);
        },
      }),
    );
  }
}
