import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import type { ShareReceivedEvent } from '@capgo/capacitor-share-target';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';
import { MediaAsset } from '../models';
import { PostsService } from '../posts.service';
import { ServerConfigService } from '../server-config.service';
import { ToastService } from '../toast.service';
import { WorkspaceService } from '../workspace.service';
import { ShareDraftService, SharedFileBlob } from './share-draft.service';

export const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
const URL_RE = /https?:\/\/[^\s<>"']+/i;

export interface ShareProgress {
  done: number;
  total: number;
  current: string;
}

/** Splits shared texts into {link, body}: the first http(s) URL becomes the link. */
export function parseSharedText(texts: string[], title?: string): { title: string; body: string; link: string } {
  const joined = texts
    .map((t) => (t ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
  const m = URL_RE.exec(joined);
  const link = m ? m[0].replace(/[.,;:!?)\]]+$/, '') : '';
  let body = joined;
  if (link) {
    const without = joined.split(link).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    // If the text is only the link (or the link plus the page title), keep the link in the body:
    // the user decides in the composer.
    const t = (title ?? '').trim();
    body = without && without !== t ? without : joined;
  }
  return { title: (title ?? '').trim(), body, link };
}

/**
 * "Share with Markette": receives text/links/files from the OS share sheet, uploads media to the
 * active workspace and opens the composer pre-filled. Shares that arrive before sign-in (or before
 * a server is chosen) wait in memory and resume after login.
 */
@Injectable({ providedIn: 'root' })
export class ShareIntakeService {
  private auth = inject(AuthService);
  private ws = inject(WorkspaceService);
  private server = inject(ServerConfigService);
  private posts = inject(PostsService);
  private drafts = inject(ShareDraftService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly pending = signal<ShareReceivedEvent | null>(null);
  readonly progress = signal<ShareProgress | null>(null);
  readonly busy = computed(() => !!this.progress());
  private running = false;

  receive(event: ShareReceivedEvent) {
    this.pending.set(event);
    if (this.server.needsSetup() || !this.auth.isLoggedIn()) {
      this.toast.info('Shared content received', 'Sign in to continue; your draft will open right after.');
      return;
    }
    void this.resume();
  }

  /** Called after login / when the app shell is ready. */
  async resume() {
    const event = this.pending();
    if (!event || this.running || this.server.needsSetup() || !this.auth.isLoggedIn()) return;
    this.running = true;
    try {
      await this.ws.ensureLoaded().catch(() => undefined);
      if (!this.ws.active()) {
        this.toast.warning('No workspace', 'Create or join a workspace, then share again.');
        this.pending.set(null);
        return;
      }
      this.pending.set(null);
      const parsed = parseSharedText(event.texts ?? [], event.title);
      const { media, files } = await this.uploadFiles(event.files ?? []);
      this.drafts.set({
        ...parsed,
        media,
        files,
        mediaWorkspace: this.ws.slug(),
        receivedAt: Date.now(),
      });
      // Go through a blank route so an already-open composer re-initialises with the new draft.
      await this.router.navigateByUrl('/switching', { skipLocationChange: true });
      await this.router.navigate(['/compose'], { queryParams: { shared: 1 } });
    } finally {
      this.progress.set(null);
      this.running = false;
    }
  }

  private async uploadFiles(list: ShareReceivedEvent['files']): Promise<{ media: MediaAsset[]; files: SharedFileBlob[] }> {
    const media: MediaAsset[] = [];
    const files: SharedFileBlob[] = [];
    const usable = list.filter((f) => {
      const ok = ALLOWED_MEDIA.includes((f.mimeType || '').toLowerCase());
      if (!ok) this.toast.warning(`Skipped ${f.name || 'a file'}`, 'Only JPEG, PNG, GIF, WebP images and MP4/MOV videos can be attached.');
      return ok;
    });
    for (let i = 0; i < usable.length; i++) {
      const f = usable[i];
      this.progress.set({ done: i, total: usable.length, current: f.name || 'file' });
      try {
        const src = f.uri.startsWith('data:') || f.uri.startsWith('blob:') || f.uri.startsWith('http') ? f.uri : Capacitor.convertFileSrc(f.uri);
        const blob = await (await fetch(src)).blob();
        const mime = (f.mimeType || blob.type || '').toLowerCase();
        const name = f.name || `shared-${i + 1}.${mime.split('/')[1] ?? 'bin'}`;
        files.push({ blob, name, mime });
        const file = new File([blob], name, { type: mime });
        media.push(await firstValueFrom(this.posts.upload(file)));
      } catch (err) {
        this.toast.error(`Could not attach ${f.name || 'a file'}`, err);
      }
    }
    if (usable.length) this.progress.set({ done: usable.length, total: usable.length, current: '' });
    return { media, files };
  }
}
