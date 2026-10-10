import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { PublicInfo } from './models';
import { isNative } from './native/platform';
import { storage } from './storage';

const KEY = 'markette.server';

/**
 * Where the API lives.
 * - Web: same origin (environment.apiUrl, '' by default) — served by nginx / the dev proxy.
 * - Native app (Capacitor): the UI runs from https://localhost or capacitor://localhost, so the
 *   user picks their Markette server once; it is stored in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ServerConfigService {
  private raw = new HttpClient(inject(HttpBackend));

  readonly native = isNative();
  /** Saved server URL (native only), e.g. https://markette.example.org — no trailing slash. */
  readonly server = signal<string | null>(this.native ? storage.get(KEY) : null);
  /** Native app without a server yet: show the "Connect to your server" screen. */
  readonly needsSetup = computed(() => this.native && !this.server());
  readonly isInsecure = computed(() => (this.server() ?? '').startsWith('http://'));

  /** Prefix for API calls: '' on web (same origin), the server URL on native. */
  apiBase(): string {
    return this.native ? (this.server() ?? '') : environment.apiUrl;
  }

  /** Public origin for links people open elsewhere (invite links, MCP/API endpoints, callbacks). */
  publicOrigin(): string {
    if (this.native) return this.server() ?? '';
    return environment.apiUrl || location.origin;
  }

  /** Normalises what the user typed: adds https://, strips trailing slashes and a trailing /api. */
  normalize(input: string): string | null {
    let v = (input || '').trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    try {
      const u = new URL(v);
      if (!['http:', 'https:'].includes(u.protocol)) return null;
      const path = u.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
      return `${u.protocol}//${u.host}${path}`;
    } catch {
      return null;
    }
  }

  /** Checks the URL answers like a Markette server; returns its public info. */
  async probe(url: string): Promise<PublicInfo> {
    return firstValueFrom(this.raw.get<PublicInfo>(`${url}/api/platform/public/`).pipe(timeout(12000)));
  }

  save(url: string) {
    this.server.set(url);
    storage.set(KEY, url);
  }

  clear() {
    this.server.set(null);
    storage.remove(KEY);
  }
}
