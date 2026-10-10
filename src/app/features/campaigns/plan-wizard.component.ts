import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import { AiQuotaHintComponent } from '../../shared/components/ai-quota-hint.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Campaign, Channel, Id, PlanResponse } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ChannelBadgeComponent } from '../../shared/components/channel-badge.component';
import { CharCounterComponent } from '../../shared/components/char-counter.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { addDays, daysBetween, localInputToIso, todayYmd, toLocalInput, tzAbbrev } from '../../shared/utils/dates';
import { channelColor } from '../../shared/utils/providers';
import { measure } from '../../shared/utils/text-count';

interface DraftPub {
  channel: Id;
  body: string;
  title: string;
  local: string; // datetime-local in workspace tz
  keep: boolean;
}

interface DraftPost {
  angle: string;
  keep: boolean;
  pubs: DraftPub[];
}

interface Result {
  angle: string;
  ok: boolean;
  postId?: Id;
  scheduled?: boolean;
  error?: string;
}

type Step = 'setup' | 'loading' | 'review' | 'creating' | 'done';

const MAX_DAYS = 92;

@Component({
  selector: 'app-plan-wizard',
  imports: [MoreChannelsComponent, AiQuotaHintComponent, ModalComponent, FormsModule, AvatarComponent, ChannelBadgeComponent, CharCounterComponent, IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-wizard.component.html',
  styleUrl: './plan-wizard.component.scss',
})
export class PlanWizardComponent {
  private posts = inject(PostsService);
  protected readonly catalog = inject(CatalogService);
  protected readonly ws = inject(WorkspaceService);

  readonly open = input(false);
  readonly campaign = input.required<Campaign>();
  readonly closed = output<void>();
  readonly created = output<void>();

  protected readonly step = signal<Step>('setup');
  protected readonly selected = signal<Set<Id>>(new Set());
  protected readonly postsPerWeek = signal(3);
  protected readonly language = signal('');
  protected readonly brief = signal('');
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly error = signal('');
  protected readonly strategy = signal('');
  protected readonly draft = signal<DraftPost[]>([]);
  protected readonly warnings = signal<string[]>([]);
  protected readonly results = signal<Result[]>([]);
  protected readonly progress = signal(0);
  protected readonly elapsed = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly tz = computed(() => this.ws.timezone());
  protected readonly tzLabel = computed(() => tzAbbrev(this.tz()));
  protected readonly channels = computed(() => this.catalog.channels().filter((c) => c.status !== 'disabled'));
  protected readonly relevantList = computed(() => this.channels().filter((c) => c.relevant !== false));
  protected readonly otherList = computed(() => this.channels().filter((c) => c.relevant === false));
  protected readonly otherSelected = computed(() => this.otherList().some((c) => this.selected().has(c.id)));
  protected readonly color = channelColor;

  protected readonly periodError = computed(() => {
    const s = this.start();
    const e = this.end();
    if (!s || !e) return 'Choose the period to plan.';
    if (e < s) return 'The period ends before it starts.';
    if (daysBetween(s, e) > MAX_DAYS) return 'Plan at most three months at a time — shorten the period.';
    return '';
  });

  protected readonly keptPosts = computed(() =>
    this.draft().filter((p) => p.keep && p.pubs.some((x) => x.keep && x.body.trim())),
  );
  protected readonly keptPubCount = computed(() =>
    this.keptPosts().reduce((n, p) => n + p.pubs.filter((x) => x.keep).length, 0),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const c = this.campaign();
      const today = todayYmd(this.tz());
      const start = c.starts_on > today ? c.starts_on : today;
      let end = c.ends_on >= start ? c.ends_on : addDays(start, 27);
      if (daysBetween(start, end) > MAX_DAYS) end = addDays(start, MAX_DAYS);
      this.start.set(start);
      this.end.set(end);
      this.brief.set(c.brief || '');
      this.step.set('setup');
      this.error.set('');
      this.results.set([]);
      this.draft.set([]);
      this.warnings.set([]);
      this.catalog.loadChannels().subscribe({
        next: (list) => {
          if (!this.selected().size)
            this.selected.set(
              new Set(
                (list.some((ch) => ch.relevant !== false) ? list.filter((ch) => ch.relevant !== false) : list)
                  .filter((ch) => ch.status === 'active')
                  .map((ch) => ch.id),
              ),
            );
        },
        error: () => undefined,
      });
    });
  }

  protected isBlog(ch: Channel | undefined): boolean {
    if (!ch) return false;
    const p = this.catalog.provider(ch.provider);
    return p ? p.kind === 'blog' || p.supports_title : ['wordpress', 'drupal', 'medium', 'hugo'].includes(ch.provider);
  }

  protected maxChars(chId: Id): number | null {
    const ch = this.catalog.channel(chId);
    return ch ? (this.catalog.provider(ch.provider)?.max_chars ?? null) : null;
  }

  protected count(chId: Id, body: string): number {
    const ch = this.catalog.channel(chId);
    return measure(body, ch ? (this.catalog.provider(ch.provider)?.count_mode ?? 'chars') : 'chars');
  }

  protected toggleChannel(id: Id) {
    this.selected.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected close() {
    if (this.step() === 'creating') return;
    this.stopTimer();
    if (this.step() === 'loading') this.step.set('setup');
    this.closed.emit();
  }

  protected generate() {
    this.error.set('');
    if (!this.selected().size) {
      this.error.set('Pick at least one channel.');
      return;
    }
    if (!this.brief().trim()) {
      this.error.set('Write a short brief so the planner knows what the campaign is about.');
      return;
    }
    if (this.periodError()) {
      this.error.set(this.periodError());
      return;
    }
    this.step.set('loading');
    this.elapsed.set(0);
    this.stopTimer();
    this.timer = setInterval(() => this.elapsed.update((n) => n + 1), 1000);
    this.posts
      .plan({
        channels: [...this.selected()],
        brief: this.brief().trim(),
        start: this.start(),
        end: this.end(),
        posts_per_week: Math.max(1, Math.min(50, Math.round(this.postsPerWeek() || 1))),
        language: this.language().trim() || undefined,
        campaign: this.campaign().id,
      })
      .subscribe({
        next: (plan) => {
          this.stopTimer();
          if (this.step() !== 'loading') return; // cancelled meanwhile
          this.loadPlan(plan);
          this.step.set('review');
        },
        error: (err) => {
          this.stopTimer();
          if (this.step() !== 'loading') return;
          this.error.set(formatError(err));
          this.step.set('setup');
        },
      });
  }

  private loadPlan(plan: PlanResponse) {
    const warnings: string[] = [];
    this.strategy.set(plan.strategy || '');
    this.draft.set(
      plan.posts.map((p, i) => {
        const seen = new Set<Id>();
        const pubs: DraftPub[] = [];
        for (const pub of p.publications) {
          if (seen.has(pub.channel)) {
            warnings.push(
              `Post ${i + 1} (“${p.angle}”) had two publications for ${this.catalog.channel(pub.channel)?.name ?? 'one channel'}; only the first is kept.`,
            );
            continue;
          }
          seen.add(pub.channel);
          pubs.push({
            channel: pub.channel,
            body: pub.body || '',
            title: pub.title || '',
            local: toLocalInput(pub.scheduled_at, this.tz()),
            keep: true,
          });
        }
        pubs.sort((a, b) => a.local.localeCompare(b.local));
        return { angle: p.angle, keep: true, pubs };
      }),
    );
    this.warnings.set(warnings);
  }

  protected updatePost(i: number, patch: Partial<DraftPost>) {
    this.draft.update((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  protected updatePub(i: number, k: number, patch: Partial<DraftPub>) {
    this.draft.update((list) =>
      list.map((p, j) => (j === i ? { ...p, pubs: p.pubs.map((x, m) => (m === k ? { ...x, ...patch } : x)) } : p)),
    );
  }

  protected backToSetup() {
    this.step.set('setup');
  }

  async create(schedule: boolean) {
    const posts = this.keptPosts();
    if (!posts.length) return;
    this.step.set('creating');
    this.progress.set(0);
    this.results.set([]);
    const campaignId = this.campaign().id;
    for (const p of posts) {
      const pubs = p.pubs.filter((x) => x.keep && x.body.trim());
      const result: Result = { angle: p.angle, ok: false };
      try {
        const title = pubs.find((x) => x.title.trim())?.title.trim() || p.angle;
        const post = await firstValueFrom(
          this.posts.create({
            title,
            body: pubs[0].body,
            campaign: campaignId,
            targets: pubs.map((x) => ({ channel: x.channel, body: x.body, title: x.title })),
          }),
        );
        result.ok = true;
        result.postId = post.id;
        if (schedule) {
          const perTarget: Record<string, string> = {};
          const times: string[] = [];
          for (const x of pubs) {
            const iso = localInputToIso(x.local, this.tz());
            if (iso) {
              perTarget[`channel:${x.channel}`] = iso;
              times.push(iso);
            }
          }
          times.sort();
          try {
            await firstValueFrom(this.posts.schedule(post.id, { mode: 'exact', at: times[0] ?? null, per_target: perTarget }));
            result.scheduled = true;
          } catch (err) {
            result.scheduled = false;
            result.error = `Saved as draft, not scheduled: ${formatError(err)}`;
          }
        }
      } catch (err) {
        result.error = formatError(err);
      }
      this.results.update((r) => [...r, result]);
      this.progress.update((n) => n + 1);
    }
    this.step.set('done');
    this.created.emit();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  protected readonly okCount = computed(() => this.results().filter((r) => r.ok).length);
}
