import { MoreChannelsComponent } from '../../shared/components/more-channels.component';
import { ShareDraftService } from '../../core/native/share-draft.service';
import { ApiService } from '../../core/api.service';
import { AiQuotaHintComponent } from '../../shared/components/ai-quota-hint.component';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import {
  AdaptVariant,
  PostReview,
  Channel,
  Id,
  MediaAsset,
  Post,
  PostWrite,
  SchedulePayload,
  Suggestion,
  FollowMode,
  TargetOptions,
} from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { ChannelBadgeComponent } from '../../shared/components/channel-badge.component';
import { CharCounterComponent } from '../../shared/components/char-counter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { localInputToIso, toLocalInput, tzAbbrev } from '../../shared/utils/dates';
import { fmtBytes } from '../../shared/utils/format';
import { channelColor, providerMeta } from '../../shared/utils/providers';
import { measure, countCodepoints } from '../../shared/utils/text-count';
import { splitFirstComment } from '../../shared/utils/first-comment';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';
import { ComposePreviewComponent } from './compose-preview.component';
import { RedditOptionsComponent } from './reddit-options.component';
import { RedditPreviewComponent } from './reddit-preview.component';
import { redditKind, redditLink, redditLinkComment, redditProblems } from './reddit';
import { SpecialPreviewComponent } from './special-preview.component';
import { ChannelDraft, ChannelState, FollowCandidate, FollowDraft, LOCKED_STATES, ScheduleChoice } from './compose.models';

interface Uploading {
  key: number;
  name: string;
  error?: string;
}

const EMPTY_DRAFT: ChannelDraft = { body: '', title: '', options: {} };
/** Stands in for the followed publication's URL when counting characters (as the backend does). */
const SAMPLE_URL = 'https://example.org/' + 'x'.repeat(40);

/** What a follower actually sends: {url} and {title} filled in, the URL appended when missing. */
export function fillFollow(text: string, url: string, title: string): string {
  let out = text.replaceAll('{url}', url).replaceAll('{title}', title);
  if (!out.includes(url)) out = out.trim() ? `${out.trimEnd()}\n\n${url}` : url;
  return out;
}

@Component({
  selector: 'app-compose-page',
  imports: [AiQuotaHintComponent, MoreChannelsComponent, 
    FormsModule,
    RouterLink,
    AvatarComponent,
    ChannelBadgeComponent,
    CharCounterComponent,
    EmptyStateComponent,
    IconComponent,
    ModalComponent,
    ProviderIconComponent,
    StatusChipComponent,
    ComposePreviewComponent,
    RedditOptionsComponent,
    RedditPreviewComponent,
    SpecialPreviewComponent,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compose.page.html',
  styleUrl: './compose.page.scss',
})
export class ComposePage implements OnInit {
  /** Route param for /posts/:id/edit */
  readonly id = input<string>();

  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly posts = inject(PostsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly shareDrafts = inject(ShareDraftService);
  private readonly api = inject(ApiService);
  /** Opened from "Share with Markette". */
  protected readonly sharedBanner = signal(false);
  /** Small screens: preview below the editor, behind a toggle. */
  protected readonly showPreview = signal(false);

  /* --- loading ---------------------------------------------------------------- */
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly post = signal<Post | null>(null);
  protected readonly isEdit = computed(() => !!this.post());

  /* --- content ---------------------------------------------------------------- */
  protected readonly selected = signal<Id[]>([]);
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly link = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly tagInput = signal('');
  protected readonly campaign = signal<Id | null>(null);
  protected readonly notes = signal('');
  protected readonly showNotes = signal(false);
  protected readonly media = signal<MediaAsset[]>([]);
  protected readonly uploading = signal<Uploading[]>([]);
  protected readonly drafts = signal<Record<number, ChannelDraft>>({});
  protected readonly tab = signal<'all' | Id>('all');
  protected readonly previewFor = signal<Id | null>(null);
  protected readonly dragOver = signal(false);
  private dragIndex: number | null = null;
  private uploadSeq = 0;

  /* --- media alt text editing ---------------------------------------------------- */
  protected readonly altEditing = signal<MediaAsset | null>(null);
  protected readonly altText = signal('');
  protected readonly altSaving = signal(false);

  /* --- scheduling ------------------------------------------------------------- */
  protected readonly choice = signal<ScheduleChoice>('draft');
  protected readonly exactAt = signal('');
  protected readonly windowStart = signal('');
  protected readonly windowEnd = signal('');
  protected readonly saving = signal(false);
  protected readonly serverProblems = signal<Record<number, string[]>>({}); // by channel id
  protected readonly formError = signal('');

  /* --- AI adapt ----------------------------------------------------------------- */
  protected readonly adaptOpen = signal(false);
  protected readonly adaptInstructions = signal('');
  protected readonly adapting = signal(false);
  protected readonly adaptError = signal('');
  protected readonly variants = signal<AdaptVariant[]>([]);
  protected readonly applied = signal<Set<number>>(new Set());

  /* --- suggest times ------------------------------------------------------------- */
  protected readonly suggesting = signal(false);
  protected readonly suggestError = signal('');
  protected readonly suggestSummary = signal('');
  protected readonly suggestions = signal<Suggestion[]>([]);

  /* --- following another publication ------------------------------------------------- */
  /** Publications of other posts that a channel can wait for (loaded on demand). */
  protected readonly followCandidates = signal<FollowCandidate[]>([]);
  protected readonly followLoading = signal(false);
  private followLoaded = false;
  protected readonly followModes: { value: FollowMode; label: string }[] = [
    { value: 'delay', label: 'Right after it, or after a delay' },
    { value: 'queue', label: 'In the next queue slot after it' },
    { value: 'best_time', label: 'At the best time after it' },
  ];

  protected readonly tz = computed(() => this.ws.timezone());
  protected readonly tzLabel = computed(() => `${this.tz()} (${tzAbbrev(this.tz())})`);
  protected readonly fmtBytes = fmtBytes;
  protected readonly providerMeta = providerMeta;
  protected readonly channelColor = channelColor;

  protected readonly availableChannels = computed(() =>
    this.catalog.channels().filter((c) => c.status !== 'disabled' || this.selected().includes(c.id)),
  );
  /** Relevant for this workspace: listed first. */
  protected readonly relevantAvailable = computed(() => this.availableChannels().filter((c) => c.relevant !== false));
  /** Other organization channels, under "More from your organization". */
  protected readonly otherAvailable = computed(() => this.availableChannels().filter((c) => c.relevant === false));
  protected readonly otherSelected = computed(() => this.otherAvailable().some((c) => this.selected().includes(c.id)));
  protected readonly relevantUnselected = computed(() =>
    this.relevantAvailable().some((c) => c.status !== 'disabled' && !this.selected().includes(c.id)),
  );

  private readonly targetsByChannel = computed(() => {
    const map = new Map<Id, { id: Id; status: string }>();
    for (const t of this.post()?.targets ?? []) map.set(t.channel, { id: t.id, status: t.status });
    return map;
  });

  /** Per-channel derived state: effective text, counts, problems. */
  protected readonly states = computed<ChannelState[]>(() => {
    const drafts = this.drafts();
    const media = this.media();
    const server = this.serverProblems();
    return this.selected()
      .map((id) => this.catalog.channel(id))
      .filter((c): c is Channel => !!c)
      .map((channel) => {
        const provider = this.catalog.provider(channel.provider);
        const d = drafts[channel.id] ?? EMPTY_DRAFT;
        const kind = provider?.kind ?? providerMeta(channel.provider).kind;
        const isBlog = kind === 'blog';
        const isNewsletter = kind === 'newsletter';
        const forumThread = channel.provider === 'discord' && !!(d.options.forum_thread ?? channel.config?.['forum']);
        const needsTitle = isBlog || isNewsletter || !!provider?.supports_title || forumThread;
        const body = d.body.trim() ? d.body : this.body();
        const title = d.title.trim() ? d.title : this.title();
        const follow = this.followInfo(channel.id, d.follow ?? null);
        // Count what will be sent: the followed publication's URL fills {url} (or is appended).
        const sentBody = follow ? fillFollow(body, SAMPLE_URL, follow.title) : body;
        let firstComment: ChannelState['firstComment'] = null;
        let postedText = sentBody;
        if (provider?.supports_first_comment) {
          const channelDefault = !!channel.config?.['links_in_first_comment'];
          const override = d.options.links_in_first_comment;
          const split = splitFirstComment(sentBody, this.link().trim(), d.options.first_comment, override ?? channelDefault);
          postedText = split.text;
          firstComment = {
            ...split,
            count: measure(split.comment, 'chars'),
            max: provider.first_comment_max ?? null,
            channelDefault,
            override,
          };
        }
        let reddit: ChannelState['reddit'] = null;
        if (channel.provider === 'reddit') {
          const kind = redditKind(media, d.options, this.link().trim());
          reddit = { kind, link: kind === 'link' ? redditLink(this.link().trim(), body) : '' };
          if (kind === 'link') {
            // Link posts have no body: the text becomes the author's first comment (backend prepare_first_comment).
            const base = firstComment ?? { text: body, link: this.link().trim(), comment: '', moved: false, count: 0, max: null, channelDefault: false, override: undefined };
            const moved = redditLinkComment(base.text, base.link || this.link().trim(), base.comment);
            reddit.link = moved.link;
            firstComment = { ...base, text: '', link: moved.link, comment: moved.comment, count: measure(moved.comment, 'chars') };
            postedText = '';
          }
        }
        const count = measure(postedText, provider?.count_mode ?? 'chars');
        const max = provider?.max_chars ?? null;
        const problems: string[] = [];
        if (max && count > max) problems.push(`Text is ${count - max} over the ${max}-character limit.`);
        if (firstComment?.max && firstComment.count > firstComment.max)
          problems.push(`The first comment is ${firstComment.count - firstComment.max} over the ${firstComment.max}-character limit.`);
        if (channel.provider === 'youtube') {
          if (!media.some((m) => m.mime.startsWith('video/'))) problems.push('YouTube needs a video.');
        } else if (provider?.requires_media && !media.length) problems.push(`${provider.label} needs at least one image or video.`);
        if (provider && media.length > provider.max_media) problems.push(`${provider.label} accepts at most ${provider.max_media} media items.`);
        if (provider && !provider.supports_video && media.some((m) => m.mime.startsWith('video/')))
          problems.push(`${provider.label} does not support video here.`);
        if (needsTitle && !title.trim())
          problems.push(forumThread && !isBlog && !provider?.supports_title ? 'Forum threads need a title.' : isNewsletter ? 'An email subject is required.' : 'A title is required.');
        if (!body.trim() && !media.length && !(reddit?.kind === 'link' && reddit.link)) problems.push('Nothing to publish yet.');
        if (channel.provider === 'reddit') {
          for (const p of redditProblems(channel, title, body, d.options, media, this.link().trim())) if (!problems.includes(p)) problems.push(p);
        }
        // Network-specific rules mirrored from the backend providers.
        if (channel.provider === 'whatsapp') {
          if (media.length && !channel.config?.['template_has_image'])
            problems.push('The WhatsApp template has no image header; remove the image or use another template.');
          if (body.includes('\n\n\n') || body.includes('    '))
            problems.push('WhatsApp templates refuse more than two line breaks or four spaces in a row.');
        } else if (channel.provider === 'wechat') {
          if (countCodepoints(title) > 64) problems.push('WeChat titles are limited to 64 characters.');
          const cover = media[0];
          if (cover && !['image/jpeg', 'image/png'].includes(cover.mime)) problems.push('The WeChat cover (first image) must be a JPEG or PNG.');
        } else if (channel.provider === 'youtube') {
          if (countCodepoints(title) > 100) problems.push('YouTube titles are limited to 100 characters.');
          if (/[<>]/.test(title)) problems.push('YouTube titles cannot contain < or >.');
        } else if (channel.provider === 'threads') {
          const links = new Set(body.match(/https?:\/\/[^\s<>"']+/gi) ?? []);
          if (links.size > 5) problems.push('Threads allows at most 5 different links per post.');
        } else if (channel.provider === 'qq' && channel.config?.['kind'] === 'group' && /https?:\/\/[^\s<>"']+/i.test(body)) {
          problems.push('QQ does not allow links in group messages; remove them.');
        }
        if (follow?.problem) problems.push(follow.problem);
        if (channel.status === 'needs_reauth') problems.push(`${channel.name} needs to be reconnected.`);
        for (const p of server[channel.id] ?? []) if (!problems.includes(p)) problems.push(p);
        const target = this.targetsByChannel().get(channel.id);
        const targetStatus = (target?.status ?? null) as ChannelState['targetStatus'];
        return {
          channel,
          provider,
          isBlog,
          isNewsletter,
          needsTitle,
          forumThread,
          emailed:
            channel.provider === 'ghost' &&
            d.options.status !== 'draft' &&
            !!('newsletter' in d.options ? d.options.newsletter : channel.config?.['newsletter']),
          body,
          title,
          count,
          max,
          problems,
          targetId: target?.id ?? null,
          targetStatus,
          locked: !!targetStatus && LOCKED_STATES.includes(targetStatus),
          customized: !!(d.body.trim() || d.title.trim()),
          firstComment,
          reddit,
          follow: follow ? { label: follow.label, mode: follow.mode, delay: follow.delay } : null,
        };
      });
  });

  protected readonly anyBlog = computed(() => this.states().some((s) => s.needsTitle));
  /** Channels that wait for another publication. */
  protected readonly followers = computed(() => this.states().filter((s) => s.follow && !s.locked));
  protected readonly titleLabel = computed(() => {
    const st = this.states().filter((s) => s.needsTitle);
    if (st.length && st.every((s) => s.isNewsletter)) return 'Email subject';
    return 'Title';
  });
  protected readonly activeState = computed(() => {
    const t = this.tab();
    return t === 'all' ? null : (this.states().find((s) => s.channel.id === t) ?? null);
  });
  protected readonly blockingProblems = computed(() =>
    this.states()
      .filter((s) => !s.locked && s.problems.length)
      .map((s) => ({ channel: s.channel, problems: s.problems })),
  );
  protected readonly previewState = computed(() => {
    const id = this.previewFor();
    const list = this.states();
    return list.find((s) => s.channel.id === id) ?? list[0] ?? null;
  });
  protected readonly previewId = computed(() => this.previewState()?.channel.id ?? null);
  protected readonly maxMediaAllowed = computed(() => {
    const limits = this.states().map((s) => s.provider?.max_media ?? 4);
    return limits.length ? Math.min(...limits) : 10;
  });
  protected readonly hasLocked = computed(() => this.states().some((s) => s.locked));
  protected readonly isScheduled = computed(() => this.post()?.status === 'scheduled');

  /* --- approval ------------------------------------------------------------------ */
  protected readonly reviewComment = signal('');
  protected readonly reviews = signal<PostReview[]>([]);
  /** Channels whose posts need a reviewer's approval for this user. */
  protected readonly reviewChannels = computed(() => this.states().filter((s) => s.channel.approval_required && !s.locked));
  protected readonly schedulingChoice = computed(() => !['draft', 'keep'].includes(this.choice()));
  protected readonly requiresReview = computed(() => this.reviewChannels().length > 0 && this.schedulingChoice());
  protected readonly approvalStatus = computed(() => this.post()?.approval_status ?? '');
  protected readonly lastChangeRequest = computed(() =>
    [...this.reviews()].reverse().find((r) => r.action === 'changes_requested') ?? null,
  );
  protected readonly hiddenTargets = computed(() => this.post()?.hidden_targets ?? 0);

  protected readonly primaryLabel = computed(() => {
    if (this.requiresReview()) return 'Submit for review';
    switch (this.choice()) {
      case 'draft':
        return this.isEdit() ? 'Save draft' : 'Save draft';
      case 'keep':
        return 'Save changes';
      case 'now':
        return 'Publish now';
      case 'exact':
        return 'Schedule';
      case 'queue':
        return 'Add to queue';
      case 'best_time':
        return 'Schedule at best time';
      case 'suggest':
        return 'Schedule at suggested times';
    }
  });

  ngOnInit() {
    this.exactAt.set(this.defaultExact());
    void this.init();
  }

  private defaultExact(): string {
    const d = new Date(Date.now() + 60 * 60_000);
    d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15, 0, 0);
    return toLocalInput(d, this.tz());
  }

  private async init() {
    await this.catalog.ensureAll();
    const qp = this.route.snapshot.queryParamMap;
    const id = this.id();
    if (id) {
      try {
        const post = await firstValueFrom(this.posts.get(+id));
        this.hydrate(post);
      } catch (err) {
        this.loadError.set(formatError(err));
      }
    } else {
      const campaign = qp.get('campaign');
      if (campaign && /^\d+$/.test(campaign)) this.campaign.set(+campaign);
      const at = qp.get('at');
      if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) {
        this.exactAt.set(at.slice(0, 16));
        this.choice.set('exact');
      }
      const channel = qp.get('channel');
      const channels = (qp.get('channels') ?? '').split(',').filter((x) => /^\d+$/.test(x) && this.catalog.channel(+x)).map(Number);
      const shared = qp.has('shared') || qp.has('text') || qp.has('link') || qp.has('media');
      if (channels.length) this.selected.set(channels);
      else if (channel && this.catalog.channel(+channel)) this.selected.set([+channel]);
      else {
        const relevant = this.catalog.activeChannels().filter((c) => c.relevant !== false);
        if (!shared && relevant.length === 1) this.selected.set([relevant[0].id]);
      }
      // Pre-fill from a share (?text=&link=&title=&media=1,2) or the in-memory share draft.
      if (qp.get('title')) this.title.set(qp.get('title')!);
      if (qp.get('text')) this.body.set(qp.get('text')!);
      if (qp.get('link')) this.link.set(qp.get('link')!);
      const mediaIds = (qp.get('media') ?? '').split(',').filter((x) => /^\d+$/.test(x));
      if (mediaIds.length) {
        const assets = await Promise.all(mediaIds.map((m) => firstValueFrom(this.api.get<MediaAsset>(`media/${m}/`)).catch(() => null)));
        this.media.set(assets.filter((a): a is MediaAsset => !!a));
      }
      if (qp.has('shared')) await this.applyShareDraft();
      const follow = qp.get('follow');
      if (follow && /^\d+$/.test(follow)) await this.startAnnouncement(+follow);
      if (shared) this.sharedBanner.set(true);
    }
    this.loading.set(false);
  }

  /** Content shared from another app (native share sheet). Re-uploads files after a workspace switch. */
  private async applyShareDraft() {
    const d = this.shareDrafts.draft();
    if (!d) return;
    if (d.title) this.title.set(d.title);
    if (d.body) this.body.set(d.body);
    if (d.link) this.link.set(d.link);
    if (d.mediaWorkspace === this.ws.slug()) {
      this.media.set([...d.media]);
    } else if (d.files.length) {
      const uploaded: MediaAsset[] = [];
      for (const f of d.files) {
        try {
          uploaded.push(await firstValueFrom(this.posts.upload(new File([f.blob], f.name, { type: f.mime }))));
        } catch (err) {
          this.toast.error(`Could not attach ${f.name}`, err);
        }
      }
      this.media.set(uploaded);
      this.shareDrafts.update({ media: uploaded, mediaWorkspace: this.ws.slug() });
    }
  }

  protected dismissShared() {
    this.sharedBanner.set(false);
    this.shareDrafts.clear();
  }

  protected switchSharedWorkspace(slug: string) {
    // The draft (with the original files) survives the switch; media are re-uploaded there.
    this.ws.switchTo(slug);
  }

  private hydrate(post: Post) {
    this.post.set(post);
    if (post.approval_status) {
      this.posts.reviews(post.id).subscribe({ next: (r) => this.reviews.set(r), error: () => undefined });
    }
    this.title.set(post.title);
    this.body.set(post.body);
    this.link.set(post.link);
    this.tags.set([...(post.tags ?? [])]);
    this.campaign.set(post.campaign);
    this.notes.set(post.notes);
    this.showNotes.set(!!post.notes);
    this.media.set([...post.media]);
    const live = post.targets.filter((t) => t.status !== 'cancelled');
    this.selected.set(live.map((t) => t.channel));
    const drafts: Record<number, ChannelDraft> = {};
    const external: FollowCandidate[] = [];
    for (const t of live) {
      const src = t.follows_detail;
      let follow: FollowDraft | null = null;
      if (src) {
        const samePost = src.post_id === post.id;
        follow = { channel: samePost ? src.channel : null, target: samePost ? null : src.id, mode: t.follow_mode, delay: t.follow_delay };
        if (!samePost) external.push(this.candidateFrom(src.id, src.post_id, src.post_title, src.channel_name, src.provider, src.status));
      }
      drafts[t.channel] = { body: t.body ?? '', title: t.title ?? '', options: { ...(t.options ?? {}) }, follow };
    }
    this.drafts.set(drafts);
    if (external.length) this.mergeCandidates(external);
    this.choice.set(post.status === 'scheduled' ? 'keep' : 'draft');
    if (post.window_start) this.windowStart.set(toLocalInput(post.window_start, this.tz()));
    if (post.window_end) this.windowEnd.set(toLocalInput(post.window_end, this.tz()));
    const firstScheduled = live.find((t) => t.scheduled_at)?.scheduled_at;
    if (firstScheduled && new Date(firstScheduled).getTime() > Date.now()) this.exactAt.set(toLocalInput(firstScheduled, this.tz()));
  }

  /* --- following another publication ------------------------------------------------- */

  private candidateFrom(id: Id, postId: Id, postTitle: string, channelName: string, provider: string, status: FollowCandidate['status']): FollowCandidate {
    const title = (postTitle || 'Untitled post').trim();
    const short = title.length > 60 ? `${title.slice(0, 59)}…` : title;
    return { id, postId, label: `${channelName}: “${short}”`, channelName, provider, status, title: postTitle };
  }

  private mergeCandidates(list: FollowCandidate[]) {
    this.followCandidates.update((cur) => {
      const seen = new Set(cur.map((c) => c.id));
      return [...cur, ...list.filter((c) => !seen.has(c.id))];
    });
  }

  /** Recent publications of other posts (drafts, scheduled and published). */
  protected async loadFollowCandidates() {
    if (this.followLoaded || this.followLoading()) return;
    this.followLoading.set(true);
    try {
      const page = await firstValueFrom(this.posts.list({ ordering: '-updated_at', limit: 50 }));
      const own = this.post()?.id;
      const list: FollowCandidate[] = [];
      for (const p of page.results) {
        if (p.id === own) continue;
        for (const t of p.targets) {
          if (t.status === 'cancelled' || t.status === 'failed') continue;
          const title = p.title || p.body.replace(/\s+/g, ' ').slice(0, 60);
          list.push(this.candidateFrom(t.id, p.id, title, t.channel_detail?.name ?? 'Channel', t.channel_detail?.provider ?? '', t.status));
        }
      }
      this.mergeCandidates(list);
      this.followLoaded = true;
    } catch (err) {
      this.toast.error('Could not load your other posts', err);
    } finally {
      this.followLoading.set(false);
    }
  }

  /** New post from "Announce": every channel waits for that publication and links to it. */
  private async startAnnouncement(targetId: Id) {
    await this.loadFollowCandidates();
    const src = this.followCandidates().find((c) => c.id === targetId);
    if (!src) {
      this.toast.error('Publication not found', 'It may have been deleted, or it is older than your 50 latest posts.');
      return;
    }
    if (!this.body()) this.body.set('{title}\n\n{url}');
    const follow: FollowDraft = { channel: null, target: targetId, mode: 'delay', delay: 0 };
    this.drafts.update((all) => {
      const next = { ...all };
      for (const id of this.selected()) next[id] = { ...(next[id] ?? EMPTY_DRAFT), follow };
      return next;
    });
    this.announcing.set(src);
  }

  /** The publication every newly selected channel waits for (set by "Announce"). */
  protected readonly announcing = signal<FollowCandidate | null>(null);

  private followInfo(channelId: Id, f: FollowDraft | null) {
    if (!f) return null;
    if (f.channel) {
      const ch = this.catalog.channel(f.channel);
      const name = ch?.name ?? 'another channel';
      const own = this.drafts()[f.channel];
      const srcBody = own?.body.trim() ? own.body : this.body();
      const firstLine = srcBody.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
      return {
        label: `${name} (this post)`,
        title: (own?.title.trim() ? own.title : this.title()) || firstLine.slice(0, 100),
        mode: f.mode,
        delay: f.delay,
        problem: !this.selected().includes(f.channel)
          ? `Waits for ${name}, which is no longer selected.`
          : f.channel === channelId
            ? 'A channel cannot wait for itself.'
            : '',
      };
    }
    const c = this.followCandidates().find((x) => x.id === f.target);
    return { label: c?.label ?? `Publication #${f.target}`, title: c?.title ?? '', mode: f.mode, delay: f.delay, problem: '' };
  }

  protected followValue(id: Id): string {
    const f = this.draft(id).follow;
    return f?.channel ? `c:${f.channel}` : f?.target ? `t:${f.target}` : '';
  }

  protected setFollow(id: Id, value: string) {
    const cur = this.draft(id).follow;
    const [kind, raw] = value.split(':');
    if (!kind || !raw) {
      this.patchDraft(id, { follow: null });
      return;
    }
    const ref = +raw;
    this.patchDraft(id, {
      follow: {
        channel: kind === 'c' ? ref : null,
        target: kind === 't' ? ref : null,
        mode: cur?.mode ?? 'delay',
        delay: cur?.delay ?? 0,
      },
    });
  }

  protected setFollowMode(id: Id, mode: FollowMode) {
    const f = this.draft(id).follow;
    if (f) this.patchDraft(id, { follow: { ...f, mode } });
  }

  protected setFollowDelay(id: Id, value: number | string | null) {
    const f = this.draft(id).follow;
    const minutes = Math.max(0, Math.min(43_200, Math.round(Number(value) || 0)));
    if (f) this.patchDraft(id, { follow: { ...f, delay: minutes } });
  }

  /** Other selected channels of this post that a channel can wait for. */
  protected followSiblings(id: Id): Channel[] {
    return this.selected()
      .filter((x) => x !== id)
      .map((x) => this.catalog.channel(x))
      .filter((c): c is Channel => !!c);
  }

  /* --- channel picking ---------------------------------------------------------------- */

  protected isSelected(id: Id) {
    return this.selected().includes(id);
  }

  protected toggleChannel(ch: Channel) {
    const st = this.states().find((s) => s.channel.id === ch.id);
    if (st?.locked) {
      this.toast.info('Already published', `${ch.name} has already published this post and stays attached.`);
      return;
    }
    const adding = !this.selected().includes(ch.id);
    this.selected.update((list) => (list.includes(ch.id) ? list.filter((x) => x !== ch.id) : [...list, ch.id]));
    const announced = this.announcing();
    if (adding && announced && !this.draft(ch.id).follow) {
      this.patchDraft(ch.id, { follow: { channel: null, target: announced.id, mode: 'delay', delay: 0 } });
    }
    if (this.tab() === ch.id && !this.isSelected(ch.id)) this.tab.set('all');
    this.serverProblems.set({});
    this.suggestions.set([]);
  }

  protected selectAll() {
    // Relevant channels only; others stay opt-in under "More from your organization".
    const relevant = this.catalog.activeChannels().filter((c) => c.relevant !== false).map((c) => c.id);
    this.selected.update((cur) => [...new Set([...cur, ...relevant])]);
  }

  /* --- per-channel drafts ---------------------------------------------------------------- */

  protected draft(id: Id): ChannelDraft {
    return this.drafts()[id] ?? EMPTY_DRAFT;
  }

  protected patchDraft(id: Id, patch: Partial<ChannelDraft>) {
    this.drafts.update((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY_DRAFT), ...patch } }));
    this.serverProblems.update((p) => ({ ...p, [id]: [] }));
  }

  protected setOption(id: Id, key: keyof TargetOptions, value: unknown) {
    const opts = { ...this.draft(id).options };
    if (value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length)) delete opts[key];
    else opts[key] = value;
    this.patchDraft(id, { options: opts });
  }

  protected optionFlag(id: Id, key: keyof TargetOptions): boolean {
    return this.draft(id).options[key] === true;
  }

  protected optionString(id: Id, key: keyof TargetOptions): string {
    const v = this.draft(id).options[key];
    return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '';
  }

  protected setListOption(id: Id, key: keyof TargetOptions, value: string) {
    this.setOption(
      id,
      key,
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  protected resetDraft(id: Id) {
    this.patchDraft(id, { body: '', title: '' });
  }

  /** Ghost: '' stored explicitly means "web only"; an absent key means the channel default. */
  protected ghostWebOnly(id: Id): boolean {
    return this.draft(id).options.newsletter === '';
  }

  protected setGhostNewsletter(id: Id, webOnly: boolean, slug: string) {
    const opts = { ...this.draft(id).options };
    if (webOnly) opts.newsletter = '';
    else if (slug.trim()) opts.newsletter = slug.trim();
    else delete opts.newsletter;
    this.patchDraft(id, { options: opts });
  }

  protected ghostDefault(ch: Channel): string {
    const v = ch.config?.['newsletter'];
    return typeof v === 'string' && v ? v : '';
  }

  protected youtubePrivacyDefault(ch: Channel): string {
    const v = String(ch.config?.['privacy'] || 'public');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  protected youtubeCategoryDefault(ch: Channel): string {
    const id = String(ch.config?.['category_id'] || '22');
    return this.ytCategories.find((c) => c.id === id)?.label ?? id;
  }

  protected readonly ytCategories = [
    { id: '22', label: 'People & Blogs' },
    { id: '28', label: 'Science & Technology' },
    { id: '27', label: 'Education' },
    { id: '24', label: 'Entertainment' },
    { id: '25', label: 'News & Politics' },
    { id: '17', label: 'Sports' },
    { id: '10', label: 'Music' },
    { id: '1', label: 'Film & Animation' },
    { id: '26', label: 'Howto & Style' },
  ];

  protected wechatDefaultLabel(ch: Channel): string {
    return ch.config?.['mode'] === 'publish' ? 'Publish link only' : 'Push to followers';
  }

  protected copySharedInto(id: Id) {
    this.patchDraft(id, { body: this.body() });
  }

  /* --- tags --------------------------------------------------------------------------------- */

  protected onTagKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.commitTag();
    } else if (e.key === 'Backspace' && !this.tagInput() && this.tags().length) {
      this.tags.update((t) => t.slice(0, -1));
    }
  }

  protected commitTag() {
    const raw = this.tagInput().replace(/^#/, '').replace(/,/g, '').trim();
    if (raw && !this.tags().includes(raw)) this.tags.update((t) => [...t, raw]);
    this.tagInput.set('');
  }

  protected removeTag(tag: string) {
    this.tags.update((t) => t.filter((x) => x !== tag));
  }

  /* --- media --------------------------------------------------------------------------------- */

  protected onFiles(list: FileList | null) {
    if (!list?.length) return;
    for (const file of Array.from(list)) this.uploadFile(file);
  }

  protected onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver.set(false);
    if (this.dragIndex !== null) return;
    this.onFiles(e.dataTransfer?.files ?? null);
  }

  protected onDragOver(e: DragEvent) {
    if (this.dragIndex !== null) return;
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      this.dragOver.set(true);
    }
  }

  private uploadFile(file: File) {
    const key = ++this.uploadSeq;
    this.uploading.update((u) => [...u, { key, name: file.name }]);
    this.posts.upload(file).subscribe({
      next: (asset) => {
        this.uploading.update((u) => u.filter((x) => x.key !== key));
        this.media.update((m) => [...m, asset]);
        this.serverProblems.set({});
      },
      error: (err) => {
        this.uploading.update((u) => u.filter((x) => x.key !== key));
        this.toast.error(`Could not upload ${file.name}`, err);
      },
    });
  }

  protected removeMedia(m: MediaAsset) {
    this.media.update((list) => list.filter((x) => x.id !== m.id));
  }

  protected moveMedia(index: number, delta: number) {
    const list = [...this.media()];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    this.media.set(list);
  }

  protected thumbDragStart(i: number, e: DragEvent) {
    this.dragIndex = i;
    e.dataTransfer?.setData('text/plain', String(i));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected thumbDrop(i: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const from = this.dragIndex;
    this.dragIndex = null;
    if (from === null || from === i) return;
    const list = [...this.media()];
    const [item] = list.splice(from, 1);
    list.splice(i, 0, item);
    this.media.set(list);
  }

  protected thumbDragEnd() {
    this.dragIndex = null;
  }

  protected editAlt(m: MediaAsset) {
    this.altEditing.set(m);
    this.altText.set(m.alt_text);
  }

  protected saveAlt() {
    const m = this.altEditing();
    if (!m) return;
    this.altSaving.set(true);
    this.posts.updateMedia(m.id, this.altText()).subscribe({
      next: (updated) => {
        this.media.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.altSaving.set(false);
        this.altEditing.set(null);
      },
      error: (err) => {
        this.altSaving.set(false);
        this.toast.error('Could not save alt text', err);
      },
    });
  }

  /* --- AI adapt -------------------------------------------------------------------------------- */

  protected openAdapt() {
    this.adaptOpen.set(true);
    this.adaptError.set('');
    if (!this.variants().length) this.runAdapt();
  }

  protected runAdapt() {
    if (!this.body().trim()) {
      this.adaptError.set('Write the shared text first; AI adapts it for each network.');
      return;
    }
    this.adapting.set(true);
    this.adaptError.set('');
    this.applied.set(new Set());
    this.posts
      .adapt({
        channels: this.selected(),
        body: this.body(),
        title: this.title() || undefined,
        instructions: this.adaptInstructions() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.variants.set(r.variants);
          this.adapting.set(false);
        },
        error: (err) => {
          this.adapting.set(false);
          this.adaptError.set(formatError(err));
        },
      });
  }

  protected applyVariant(v: AdaptVariant) {
    this.patchDraft(v.channel, { body: v.body, title: v.title || this.draft(v.channel).title });
    this.applied.update((s) => new Set(s).add(v.channel));
  }

  protected applyAllVariants() {
    for (const v of this.variants()) this.applyVariant(v);
    this.adaptOpen.set(false);
    this.toast.success('Variants applied', 'Each channel now has its own copy. Review them in the channel tabs.');
  }

  protected variantChannel(id: Id) {
    return this.catalog.channel(id);
  }

  protected variantCount(v: AdaptVariant) {
    const ch = this.catalog.channel(v.channel);
    const p = ch ? this.catalog.provider(ch.provider) : undefined;
    return { count: measure(v.body, p?.count_mode ?? 'chars'), max: p?.max_chars ?? null };
  }

  /* --- suggestions ------------------------------------------------------------------------------- */

  protected runSuggest() {
    if (!this.selected().length) {
      this.suggestError.set('Pick at least one channel.');
      return;
    }
    this.suggesting.set(true);
    this.suggestError.set('');
    this.suggestions.set([]);
    this.posts
      .suggest({
        channels: this.selected(),
        post: this.post()?.id,
        body: this.body(),
        title: this.title(),
        window_start: localInputToIso(this.windowStart(), this.tz()),
        window_end: localInputToIso(this.windowEnd(), this.tz()),
        campaign: this.campaign(),
        use_ai: this.ws.aiEnabled(),
      })
      .subscribe({
        next: (r) => {
          this.suggesting.set(false);
          this.suggestSummary.set(r.summary);
          this.suggestions.set(r.suggestions);
          if (!r.suggestions.length) this.suggestError.set('No free slot found in this window. Try a wider window.');
        },
        error: (err) => {
          this.suggesting.set(false);
          this.suggestError.set(formatError(err));
        },
      });
  }

  protected setSuggestionTime(s: Suggestion, local: string) {
    const iso = localInputToIso(local, this.tz());
    if (!iso) return;
    this.suggestions.update((list) => list.map((x) => (x === s ? { ...x, scheduled_at: iso, source: x.source, rationale: x.rationale } : x)));
  }

  protected toLocal(iso: string) {
    return toLocalInput(iso, this.tz());
  }

  /* --- save + schedule ------------------------------------------------------------------------------ */

  private payload(): PostWrite {
    const drafts = this.drafts();
    return {
      title: this.title().trim(),
      body: this.body(),
      link: this.link().trim(),
      tags: this.tags(),
      campaign: this.campaign(),
      notes: this.notes(),
      media_ids: this.media().map((m) => m.id),
      targets: this.selected().map((channel) => {
        const d = drafts[channel] ?? EMPTY_DRAFT;
        const f = d.follow;
        return {
          channel,
          body: d.body.trim() ? d.body : '',
          title: d.title.trim() ? d.title : '',
          options: d.options ?? {},
          follows: f?.target ?? null,
          follows_channel: f?.channel ?? null,
          follow_mode: f?.mode ?? 'delay',
          follow_delay: f?.delay ?? 0,
        };
      }),
    };
  }

  private schedulePayload(): SchedulePayload | null | 'invalid' {
    const tz = this.tz();
    switch (this.choice()) {
      case 'draft':
      case 'keep':
        return null;
      case 'now':
        return { mode: 'now' };
      case 'exact': {
        const at = localInputToIso(this.exactAt(), tz);
        if (!at) {
          this.formError.set('Pick a date and time.');
          return 'invalid';
        }
        if (new Date(at).getTime() < Date.now() - 60_000) {
          this.formError.set('That time is in the past.');
          return 'invalid';
        }
        return { mode: 'exact', at };
      }
      case 'queue':
        return { mode: 'queue', window_start: localInputToIso(this.windowStart(), tz) };
      case 'best_time': {
        const ws = localInputToIso(this.windowStart(), tz);
        const we = localInputToIso(this.windowEnd(), tz);
        if (ws && we && new Date(we) <= new Date(ws)) {
          this.formError.set('The window must end after it starts.');
          return 'invalid';
        }
        return { mode: 'best_time', window_start: ws, window_end: we };
      }
      case 'suggest': {
        const list = this.suggestions();
        if (!list.length) {
          this.formError.set('Get suggestions first, then schedule.');
          return 'invalid';
        }
        const per: Record<string, string> = {};
        for (const s of list) per[`channel:${s.channel}`] = new Date(s.scheduled_at).toISOString();
        const earliest = list.map((s) => new Date(s.scheduled_at).getTime()).reduce((a, b) => Math.min(a, b));
        return { mode: 'exact', at: new Date(Math.max(earliest, Date.now() + 60_000)).toISOString(), per_target: per };
      }
    }
  }

  protected async submit() {
    this.formError.set('');
    this.serverProblems.set({});
    if (!this.selected().length && this.choice() !== 'draft') {
      this.formError.set('Pick at least one channel to publish to.');
      return;
    }
    if (!this.body().trim() && !this.media().length && !this.states().some((s) => s.customized)) {
      this.formError.set('Write something or add media first.');
      return;
    }
    const sched = this.schedulePayload();
    if (sched === 'invalid') return;
    if (sched && this.blockingProblems().length) {
      this.formError.set('Fix the issues listed for each channel before scheduling, or save as a draft.');
      return;
    }

    this.saving.set(true);
    const existing = this.post();
    const save$: Observable<Post> = existing ? this.posts.update(existing.id, this.payload()) : this.posts.create(this.payload());
    let saved: Post | null = null;
    try {
      saved = await firstValueFrom(save$);
      this.hydrateSaved(saved);
      if (this.sharedBanner()) this.shareDrafts.clear();
      if (sched) {
        const payload = this.reviewComment().trim() ? { ...sched, comment: this.reviewComment().trim() } : sched;
        const res = await firstValueFrom(this.posts.scheduleWithStatus(saved.id, payload));
        const scheduled = res.body ?? saved;
        this.saving.set(false);
        if (res.status === 202 || scheduled.approval_status === 'pending') {
          this.toast.info('Submitted for review', 'A reviewer from the channel\'s team will approve it; it is scheduled as soon as they do.');
          this.router.navigate(['/posts', scheduled.id]);
          return;
        }
        this.toast.success(this.successTitle(), this.successMessage(scheduled));
        this.router.navigate(['/posts', scheduled.id]);
        return;
      }
      this.saving.set(false);
      this.toast.success(existing ? 'Changes saved' : 'Draft saved');
      if (!existing) this.location.replaceState(`/posts/${saved.id}/edit`);
    } catch (err) {
      this.saving.set(false);
      this.handleError(err, saved);
    }
  }

  /** Keep local state in sync with what the server stored (target ids for problem mapping). */
  private hydrateSaved(post: Post) {
    this.post.set(post);
  }

  private successTitle() {
    switch (this.choice()) {
      case 'now':
        return 'Publishing now';
      case 'queue':
        return 'Added to the queue';
      case 'best_time':
        return 'Scheduled at the best time';
      default:
        return 'Scheduled';
    }
  }

  private successMessage(post: Post): string {
    const tz = this.tz();
    const lines = post.targets
      .filter((t) => t.scheduled_at && t.status === 'scheduled')
      .map((t) => `${t.channel_detail?.name ?? 'Channel'}: ${new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t.scheduled_at!))}`);
    for (const t of post.targets.filter((x) => x.waiting)) {
      lines.push(`${t.channel_detail?.name ?? 'Channel'}: after ${t.follows_detail?.channel_name ?? 'the publication it waits for'}`);
    }
    return lines.slice(0, 5).join('\n');
  }

  private handleError(err: unknown, saved: Post | null) {
    if (err instanceof HttpErrorResponse && err.status === 400 && err.error && typeof err.error === 'object') {
      const targets = (err.error as Record<string, unknown>)['targets'];
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
        const byChannel: Record<number, string[]> = {};
        const post = saved ?? this.post();
        for (const [targetId, problems] of Object.entries(targets as Record<string, string[]>)) {
          const t = post?.targets.find((x) => String(x.id) === targetId);
          if (t) byChannel[t.channel] = Array.isArray(problems) ? problems : [String(problems)];
        }
        if (Object.keys(byChannel).length) {
          this.serverProblems.set(byChannel);
          this.formError.set(
            saved ? 'Saved as a draft, but some channels cannot publish this content yet. See the issues below.' : 'Some channels cannot publish this content.',
          );
          return;
        }
      }
    }
    const msg = formatError(err);
    this.formError.set(saved ? `Saved as a draft, but scheduling failed:\n${msg}` : msg);
    if (saved && !this.id()) this.location.replaceState(`/posts/${saved.id}/edit`);
  }

  protected trackMedia = (_: number, m: MediaAsset) => m.id;
}
