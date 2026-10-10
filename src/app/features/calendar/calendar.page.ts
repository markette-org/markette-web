import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { BestTimesResponse, CalendarItem, Campaign, Id } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ChannelBadgeComponent } from '../../shared/components/channel-badge.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { NumPipe, PctPipe } from '../../shared/pipes/num.pipe';
import { TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import {
  Ymd,
  addDays,
  addMonths,
  atTime,
  formatDayLabel,
  formatHour,
  formatInTz,
  formatTime,
  minutesOfDay,
  parseYmd,
  startOfDayUtc,
  startOfMonth,
  startOfWeek,
  todayYmd,
  tzAbbrev,
  weekdayNames,
  weekdayOf,
  ymdOf,
} from '../../shared/utils/dates';
import { channelColor, providerMeta } from '../../shared/utils/providers';

type View = 'month' | 'week';

const MOVABLE = new Set(['draft', 'scheduled', 'failed']);
const HOUR_H = 52;

interface Band {
  campaign: Campaign;
  label: boolean;
  start: boolean;
  end: boolean;
}

@Component({
  selector: 'app-calendar-page',
  imports: [MoreChannelsComponent, 
    FormsModule,
    RouterLink,
    IconComponent,
    ProviderIconComponent,
    AvatarComponent,
    ChannelBadgeComponent,
    StatusChipComponent,
    TzDatePipe,
    NumPipe,
    PctPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly posts = inject(PostsService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly HOUR_H = HOUR_H;
  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);
  protected readonly weekdays = weekdayNames('short');

  protected readonly view = signal<View>('month');
  protected readonly anchor = signal<Ymd>(todayYmd(this.ws.timezone()));
  protected readonly items = signal<CalendarItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly channelFilter = signal<Id[]>([]);
  protected readonly otherFiltered = computed(() => this.channelFilter().some((id) => !this.catalog.isRelevant(id)));
  protected readonly campaignFilter = signal<Id | null>(null);
  protected readonly teamFilter = signal<Id | null>(null);
  /** Post ids waiting for review (calendar items carry no approval field). */
  protected readonly pendingPosts = signal<Set<Id>>(new Set());
  protected readonly selected = signal<CalendarItem | null>(null);
  protected readonly dragging = signal<CalendarItem | null>(null);
  protected readonly dropTarget = signal<string | null>(null);

  protected readonly showBest = signal(false);
  protected readonly bestChannel = signal<Id | null>(null);
  protected readonly bestScores = signal<number[][] | null>(null);
  protected readonly bestLoading = signal(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('weekScroll');
  private readonly drawerClose = viewChild<ElementRef<HTMLElement>>('drawerClose');

  protected readonly tz = computed(() => this.ws.timezone());
  protected readonly tzLabel = computed(() => tzAbbrev(this.tz()));
  protected readonly today = computed(() => todayYmd(this.tz()));
  protected readonly canDrag = computed(() => this.ws.canWrite());

  protected readonly range = computed(() => {
    const a = this.anchor();
    if (this.view() === 'week') {
      const start = startOfWeek(a);
      return { start, days: 7 };
    }
    const start = startOfWeek(startOfMonth(a));
    const monthEnd = addDays(addMonths(a, 1), -1);
    const lastWeekStart = startOfWeek(monthEnd);
    const weeks = Math.round(this.diff(start, lastWeekStart) / 7) + 1;
    return { start, days: weeks * 7 };
  });

  protected readonly days = computed(() => {
    const { start, days } = this.range();
    return Array.from({ length: days }, (_, i) => addDays(start, i));
  });

  protected readonly weeks = computed(() => {
    const d = this.days();
    const out: Ymd[][] = [];
    for (let i = 0; i < d.length; i += 7) out.push(d.slice(i, i + 7));
    return out;
  });

  protected readonly title = computed(() => {
    const a = this.anchor();
    if (this.view() === 'month') return formatDayLabel(startOfMonth(a), { month: 'long', year: 'numeric' });
    const s = startOfWeek(a);
    const e = addDays(s, 6);
    const sameMonth = parseYmd(s).month === parseYmd(e).month;
    return `${formatDayLabel(s, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${formatDayLabel(e, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  });

  /** Items grouped by local day, sorted by time. */
  protected readonly byDay = computed(() => {
    const tz = this.tz();
    const map = new Map<Ymd, CalendarItem[]>();
    for (const it of this.items()) {
      const when = this.when(it);
      if (!when) continue;
      const day = ymdOf(when, tz);
      const list = map.get(day) ?? [];
      list.push(it);
      map.set(day, list);
    }
    for (const list of map.values()) list.sort((a, b) => (this.when(a) ?? '').localeCompare(this.when(b) ?? ''));
    return map;
  });

  /** Items grouped by "day|hour" for the week grid. */
  protected readonly byHour = computed(() => {
    const tz = this.tz();
    const map = new Map<string, CalendarItem[]>();
    for (const [day, list] of this.byDay()) {
      for (const it of list) {
        const h = Math.floor(minutesOfDay(this.when(it)!, tz) / 60);
        const key = `${day}|${h}`;
        map.set(key, [...(map.get(key) ?? []), it]);
      }
    }
    return map;
  });

  protected readonly visibleCampaigns = computed(() => {
    const days = this.days();
    if (!days.length) return [];
    const first = days[0];
    const last = days[days.length - 1];
    const filter = this.campaignFilter();
    return this.catalog
      .campaigns()
      .filter((c) => c.starts_on <= last && c.ends_on >= first && (filter === null || c.id === filter));
  });

  protected readonly bands = computed(() => {
    const map = new Map<Ymd, Band[]>();
    const camps = this.visibleCampaigns();
    for (const day of this.days()) {
      const list: Band[] = [];
      for (const c of camps) {
        if (c.starts_on <= day && c.ends_on >= day) {
          const isStart = c.starts_on === day;
          list.push({ campaign: c, start: isStart, end: c.ends_on === day, label: isStart || weekdayOf(day) === 0 });
        }
      }
      map.set(day, list);
    }
    return map;
  });

  protected readonly nowLine = computed(() => {
    const now = new Date();
    const minutes = minutesOfDay(now, this.tz());
    return { day: this.today(), minutes, hour: Math.floor(minutes / 60) };
  });

  constructor() {
    effect(() => {
      const { start, days } = this.range();
      const channels = this.channelFilter();
      const campaign = this.campaignFilter();
      const team = this.teamFilter();
      const tz = this.tz();
      untracked(() => this.load(start, days, channels, campaign, tz, team));
    });
    effect(() => {
      const on = this.showBest();
      const ch = this.bestChannel();
      if (this.view() !== 'week') return;
      untracked(() => {
        if (!on || ch === null) {
          this.bestScores.set(null);
          return;
        }
        this.loadBest(ch);
      });
    });
    effect(() => {
      const el = this.drawerClose()?.nativeElement;
      if (el) setTimeout(() => el.focus());
    });
    afterNextRender(() => this.scrollToMorning());
  }

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const camp = Number(q.get('campaign'));
    if (camp) this.campaignFilter.set(camp);
    const team = Number(q.get('team'));
    if (team) this.teamFilter.set(team);
    this.catalog.loadTeams().subscribe({ error: () => undefined });
    const date = q.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) this.anchor.set(date);
    if (q.get('view') === 'week') this.view.set('week');
    this.catalog.ensureAll().then(() => {
      if (this.bestChannel() === null && this.catalog.channels().length) {
        this.bestChannel.set((this.catalog.relevantChannels()[0] ?? this.catalog.channels()[0]).id);
      }
    });
  }

  private diff(a: Ymd, b: Ymd): number {
    const pa = parseYmd(a);
    const pb = parseYmd(b);
    return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000);
  }

  private load(start: Ymd, days: number, channels: Id[], campaign: Id | null, tz: string, team: Id | null = null) {
    this.loading.set(true);
    this.error.set('');
    const s = startOfDayUtc(start, tz).toISOString();
    const e = startOfDayUtc(addDays(start, days), tz).toISOString();
    this.loadPending();
    this.posts.calendar(s, e, channels, campaign, team).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatError(err));
      },
    });
  }

  private loadPending() {
    this.posts.list({ approval: 'pending', limit: 200 }).subscribe({
      next: (page) => this.pendingPosts.set(new Set(page.results.map((p) => p.id))),
      error: () => this.pendingPosts.set(new Set()),
    });
  }

  private loadBest(channel: Id) {
    this.bestLoading.set(true);
    this.api.get<BestTimesResponse>('insights/best-times/', { channels: String(channel) }).subscribe({
      next: (r) => {
        this.bestScores.set(r.channels[0]?.scores ?? null);
        this.bestLoading.set(false);
      },
      error: (err) => {
        this.bestLoading.set(false);
        this.toast.error('Could not load best times', err);
      },
    });
  }

  private scrollToMorning() {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = HOUR_H * 7.5;
  }

  /* --- navigation ------------------------------------------------------------ */

  protected setView(v: View) {
    this.view.set(v);
    if (v === 'week') setTimeout(() => this.scrollToMorning());
  }

  protected prev() {
    this.anchor.update((a) => (this.view() === 'month' ? addMonths(a, -1) : addDays(a, -7)));
  }
  protected next() {
    this.anchor.update((a) => (this.view() === 'month' ? addMonths(a, 1) : addDays(a, 7)));
  }
  protected goToday() {
    this.anchor.set(this.today());
  }
  protected openWeek(day: Ymd) {
    this.anchor.set(day);
    this.setView('week');
  }

  /* --- filters --------------------------------------------------------------- */

  protected toggleChannel(id: Id) {
    this.channelFilter.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }
  protected clearChannels() {
    this.channelFilter.set([]);
  }
  protected setCampaign(value: string) {
    this.campaignFilter.set(value ? Number(value) : null);
  }
  protected setTeam(value: string) {
    this.teamFilter.set(value ? Number(value) : null);
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { team: value || null }, queryParamsHandling: 'merge' });
  }
  protected isPending(it: CalendarItem): boolean {
    return this.pendingPosts().has(it.post_id);
  }
  protected setBestChannel(value: string) {
    this.bestChannel.set(value ? Number(value) : null);
  }

  /* --- display helpers ------------------------------------------------------- */

  protected when(it: CalendarItem): string | null {
    return it.status === 'published' ? (it.published_at ?? it.scheduled_at) : (it.scheduled_at ?? it.published_at);
  }

  protected color(it: CalendarItem): string {
    const ch = this.catalog.channel(it.channel);
    return ch ? channelColor(ch) : providerMeta(it.provider).color;
  }

  protected time(it: CalendarItem): string {
    return formatTime(this.when(it), this.tz());
  }

  protected label(it: CalendarItem): string {
    return it.post_title || it.excerpt || '(untitled)';
  }

  /** Prefill link for composing at a free day / hour (workspace-local wall time). */
  protected composeAt(day: Ymd, hour: number): Record<string, string> {
    return { at: `${day}T${String(hour).padStart(2, '0')}:00` };
  }

  protected composeDay(day: Ymd): Record<string, string> {
    const hour = day === this.today() ? Math.min(23, Math.max(9, this.nowLine().hour + 1)) : 9;
    return this.composeAt(day, hour);
  }

  protected canComposeAt(day: Ymd, hour: number): boolean {
    return this.ws.canWrite() && atTime(day, hour, 0, this.tz()).getTime() > Date.now();
  }

  protected dayNum(day: Ymd): number {
    return parseYmd(day).day;
  }

  protected inMonth(day: Ymd): boolean {
    return parseYmd(day).month === parseYmd(this.anchor()).month;
  }

  protected dayHeader(day: Ymd): string {
    return formatDayLabel(day, { weekday: 'short', day: 'numeric' });
  }

  protected hourLabel(h: number): string {
    return formatHour(h);
  }

  protected heat(day: Ymd, hour: number): string | null {
    const s = this.bestScores();
    if (!s) return null;
    const v = s[weekdayOf(day)]?.[hour] ?? 0;
    const a = Math.max(0, Math.min(100, v)) / 100;
    return `rgba(var(--heat-hi), ${(a * 0.45).toFixed(3)})`;
  }

  protected itemsAt(day: Ymd, hour: number): CalendarItem[] {
    return this.byHour().get(`${day}|${hour}`) ?? [];
  }

  protected movable(it: CalendarItem): boolean {
    return this.canDrag() && MOVABLE.has(it.status) && !this.isPending(it);
  }

  protected itemTitle(it: CalendarItem): string {
    const when = formatInTz(this.when(it), this.tz(), { dateStyle: 'medium', timeStyle: 'short' });
    return `${it.channel_name} · ${this.isPending(it) ? 'pending review' : it.status} · ${when}\n${it.excerpt}`;
  }

  protected metricEntries(it: CalendarItem): { key: string; value: number }[] {
    const keys = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks', 'engagements'];
    return keys
      .map((k) => ({ key: k, value: it.metrics?.[k] as number | null | undefined }))
      .filter((e): e is { key: string; value: number } => typeof e.value === 'number');
  }

  /* --- drag & drop ----------------------------------------------------------- */

  protected dragStart(e: DragEvent, it: CalendarItem) {
    if (!this.movable(it)) {
      e.preventDefault();
      return;
    }
    this.dragging.set(it);
    e.dataTransfer?.setData('text/plain', String(it.id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected dragEnd() {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  protected dragOver(e: DragEvent, key: string) {
    if (!this.dragging()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (this.dropTarget() !== key) this.dropTarget.set(key);
  }

  protected dropOnDay(e: DragEvent, day: Ymd) {
    e.preventDefault();
    const it = this.dragging();
    this.dragEnd();
    if (!it) return;
    const tz = this.tz();
    const orig = this.when(it);
    const mins = orig ? minutesOfDay(orig, tz) : 9 * 60;
    if (orig && ymdOf(orig, tz) === day) return;
    this.move(it, atTime(day, Math.floor(mins / 60), mins % 60, tz));
  }

  protected dropOnHour(e: DragEvent, day: Ymd, hour: number) {
    e.preventDefault();
    const it = this.dragging();
    this.dragEnd();
    if (!it) return;
    const cell = e.currentTarget as HTMLElement;
    const rect = cell.getBoundingClientRect();
    const frac = rect.height ? Math.min(0.999, Math.max(0, (e.clientY - rect.top) / rect.height)) : 0;
    const minute = Math.floor(frac * 4) * 15;
    const target = atTime(day, hour, minute, this.tz());
    const orig = this.when(it);
    if (orig && Math.abs(new Date(orig).getTime() - target.getTime()) < 60_000) return;
    this.move(it, target);
  }

  private move(it: CalendarItem, when: Date) {
    if (when.getTime() < Date.now() + 60_000) {
      this.toast.warning('That time is in the past', 'Drop the publication on a future day or time.');
      return;
    }
    const iso = when.toISOString();
    const before = it;
    const optimistic: CalendarItem = { ...it, scheduled_at: iso, status: 'scheduled', schedule_reason: 'Moved on calendar' };
    this.replace(optimistic);
    this.posts.reschedule(it.id, iso).subscribe({
      next: (t) => {
        this.replace({ ...optimistic, scheduled_at: t.scheduled_at, status: t.status, schedule_reason: t.schedule_reason });
        this.toast.success('Rescheduled', `${it.channel_name} · ${formatInTz(t.scheduled_at, this.tz())}`);
      },
      error: (err) => {
        this.replace(before);
        this.toast.error('Could not reschedule', err);
      },
    });
  }

  private replace(it: CalendarItem) {
    this.items.update((list) => list.map((x) => (x.id === it.id ? it : x)));
    if (this.selected()?.id === it.id) this.selected.set(it);
  }

  /* --- drawer ---------------------------------------------------------------- */

  protected open(it: CalendarItem) {
    if (this.dragging()) return;
    this.selected.set(it);
  }

  protected closeDrawer() {
    this.selected.set(null);
  }

  protected onKey(e: KeyboardEvent, it: CalendarItem) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.open(it);
    }
  }
}
