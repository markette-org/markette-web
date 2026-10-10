import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, of, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Campaign, Channel, Provider, Team } from './models';
import { WorkspaceService } from './workspace.service';

/**
 * Workspace-level reference data used across screens (channels, providers, campaigns).
 * Cached in signals, invalidated on workspace switch.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private api = inject(ApiService);
  private ws = inject(WorkspaceService);

  readonly providers = signal<Provider[]>([]);
  readonly channels = signal<Channel[]>([]);
  readonly campaigns = signal<Campaign[]>([]);
  readonly channelsLoaded = signal(false);
  readonly campaignsLoaded = signal(false);
  readonly teams = signal<Team[]>([]);
  readonly teamsLoaded = signal(false);
  readonly teamMap = computed(() => new Map(this.teams().map((t) => [t.id, t])));

  readonly providerMap = computed(() => new Map(this.providers().map((p) => [p.key, p])));
  readonly channelMap = computed(() => new Map(this.channels().map((c) => [c.id, c])));
  readonly campaignMap = computed(() => new Map(this.campaigns().map((c) => [c.id, c])));
  readonly activeChannels = computed(() => this.channels().filter((c) => c.status !== 'disabled'));
  readonly needsReauth = computed(() => this.channels().filter((c) => c.status === 'needs_reauth'));
  /** Channels marked relevant for the current workspace (listed first). Missing flag = relevant. */
  readonly relevantChannels = computed(() => this.channels().filter((c) => c.relevant !== false));
  /** Other channels of the organization: usable, but not highlighted for this workspace. */
  readonly otherChannels = computed(() => this.channels().filter((c) => c.relevant === false));

  private providers$: Observable<Provider[]> | null = null;
  private lastSlug: string | null = null;

  constructor() {
    effect(() => {
      const slug = this.ws.slug();
      if (slug !== this.lastSlug) {
        this.lastSlug = slug;
        this.channels.set([]);
        this.campaigns.set([]);
        this.channelsLoaded.set(false);
        this.campaignsLoaded.set(false);
        this.teams.set([]);
        this.teamsLoaded.set(false);
      }
    });
  }

  provider(key: string): Provider | undefined {
    return this.providerMap().get(key);
  }

  channel(id: number | null | undefined): Channel | undefined {
    return id == null ? undefined : this.channelMap().get(id);
  }

  loadProviders(): Observable<Provider[]> {
    if (this.providers().length) return of(this.providers());
    if (!this.providers$) {
      this.providers$ = this.api.get<Provider[]>('providers/').pipe(
        tap({ next: (p) => this.providers.set(p), error: () => (this.providers$ = null) }),
        shareReplay(1),
      );
    }
    return this.providers$;
  }

  loadChannels(force = false): Observable<Channel[]> {
    if (this.channelsLoaded() && !force) return of(this.channels());
    return this.api.list<Channel>('channels/').pipe(
      tap((list) => {
        this.channels.set(list);
        this.channelsLoaded.set(true);
      }),
    );
  }

  loadCampaigns(force = false): Observable<Campaign[]> {
    if (this.campaignsLoaded() && !force) return of(this.campaigns());
    return this.api.list<Campaign>('campaigns/').pipe(
      tap((list) => {
        this.campaigns.set(list);
        this.campaignsLoaded.set(true);
      }),
    );
  }

  loadTeams(force = false): Observable<Team[]> {
    if (this.teamsLoaded() && !force) return of(this.teams());
    return this.api.get<Team[]>('teams/').pipe(
      tap((list) => {
        this.teams.set(list);
        this.teamsLoaded.set(true);
      }),
    );
  }

  /** Loads providers + channels + campaigns; resolves even if some fail. */
  async ensureAll(): Promise<void> {
    await Promise.allSettled([
      firstValueFrom(this.loadProviders()),
      firstValueFrom(this.loadChannels()),
      firstValueFrom(this.loadCampaigns()),
    ]);
  }

  /** Marks a channel relevant (or not) for the current workspace (workspace admins). */
  setRelevance(id: number, relevant: boolean): Observable<Channel> {
    return this.api.post<Channel>(`channels/${id}/relevance/`, { relevant }).pipe(tap((ch) => this.upsertChannel(ch)));
  }

  /** Relevant first, then the rest — the order the API uses. */
  isRelevant(id: number): boolean {
    return this.channel(id)?.relevant !== false;
  }

  upsertChannel(ch: Channel) {
    this.channels.update((list) => {
      const i = list.findIndex((c) => c.id === ch.id);
      return i === -1 ? [...list, ch] : list.map((c) => (c.id === ch.id ? ch : c));
    });
  }

  removeChannel(id: number) {
    this.channels.update((list) => list.filter((c) => c.id !== id));
  }

  upsertCampaign(c: Campaign) {
    this.campaigns.update((list) => {
      const i = list.findIndex((x) => x.id === c.id);
      return i === -1 ? [c, ...list] : list.map((x) => (x.id === c.id ? { ...x, ...c } : x));
    });
  }

  removeCampaign(id: number) {
    this.campaigns.update((list) => list.filter((c) => c.id !== id));
  }
}
