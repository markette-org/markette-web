import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ServerConfigService } from './server-config.service';
import { PlatformSettings, PlatformSettingsPatch, PublicInfo, TestAiResult } from './models';
import { storage } from './storage';

const DISMISS_KEY = 'mk.announcement.dismissed';

/**
 * Installation-wide public settings (instance name, announcement, sign-up policy),
 * loaded once at startup without auth; plus the superadmin settings API.
 */
@Injectable({ providedIn: 'root' })
export class PlatformInfoService {
  private api = inject(ApiService);
  private server = inject(ServerConfigService);
  /** Public endpoint: no auth or workspace headers needed. */
  private raw = new HttpClient(inject(HttpBackend));

  readonly info = signal<PublicInfo | null>(null);
  readonly instanceName = computed(() => this.info()?.instance_name?.trim() || 'Markette');
  readonly supportEmail = computed(() => this.info()?.support_email || '');
  readonly signupsOpen = computed(() => this.info()?.signups_open ?? true);
  readonly orgCreationOpen = computed(() => this.info()?.org_creation_open ?? true);
  readonly signupDomains = computed(() => this.info()?.signup_domains ?? []);

  private readonly dismissed = signal<string | null>(storage.get(DISMISS_KEY));
  /** The announcement to show, unless the user dismissed this exact text (critical ones cannot be dismissed). */
  readonly announcement = computed(() => {
    const i = this.info();
    const text = i?.announcement?.trim();
    if (!i || !text) return null;
    if (i.announcement_level !== 'critical' && this.dismissed() === text) return null;
    return { text, level: i.announcement_level };
  });

  /** Superadmin settings (loaded on demand by the platform console). */
  readonly settings = signal<PlatformSettings | null>(null);
  readonly publishingPaused = computed(() => !!this.settings()?.publishing_paused);

  load(): Promise<void> {
    // Native app before a server is chosen: nothing to load yet.
    if (this.server.needsSetup()) return Promise.resolve();
    return new Promise((resolve) => {
      this.raw
        .get<PublicInfo>(this.api.url('platform/public/'))
        .pipe(catchError(() => of(null)))
        .subscribe((info) => {
          if (info) this.info.set(info);
          resolve();
        });
    });
  }

  dismissAnnouncement() {
    const text = this.info()?.announcement?.trim();
    if (!text) return;
    this.dismissed.set(text);
    storage.set(DISMISS_KEY, text);
  }

  loadSettings(): Observable<PlatformSettings> {
    return this.api.get<PlatformSettings>('platform/settings/').pipe(tap((s) => this.settings.set(s)));
  }

  /** Refresh only if not loaded yet (used by the console header for the paused warning). */
  ensureSettings() {
    if (!this.settings()) this.loadSettings().subscribe({ error: () => undefined });
  }

  saveSettings(patch: PlatformSettingsPatch): Observable<PlatformSettings> {
    return this.api.patch<PlatformSettings>('platform/settings/', patch).pipe(
      tap((s) => {
        this.settings.set(s);
        // Keep the public view (name, banner, sign-ups) in sync without a reload.
        this.info.update((i) => ({
          ...(i ?? ({} as PublicInfo)),
          instance_name: s.instance_name,
          support_email: s.support_email,
          announcement: s.announcement,
          announcement_level: s.announcement_level,
          signups_open: s.signups_open,
          org_creation_open: s.org_creation_open,
          signup_domains: s.signup_domains
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
        }));
      }),
    );
  }

  testAi(): Observable<TestAiResult> {
    return this.api.post<TestAiResult>('platform/settings/test-ai/');
  }
}
