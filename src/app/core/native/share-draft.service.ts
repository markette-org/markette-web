import { Injectable, signal } from '@angular/core';
import { MediaAsset } from '../models';

export interface SharedFileBlob {
  blob: Blob;
  name: string;
  mime: string;
}

/** Content shared from another app, handed to the composer (kept until used or dismissed). */
export interface ShareDraft {
  title: string;
  body: string;
  link: string;
  media: MediaAsset[];
  /** Workspace the media were uploaded to (media are per workspace). */
  mediaWorkspace: string | null;
  /** Original files, so the composer can re-upload them after a workspace switch. */
  files: SharedFileBlob[];
  receivedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ShareDraftService {
  readonly draft = signal<ShareDraft | null>(null);

  set(d: ShareDraft) {
    this.draft.set(d);
  }

  update(patch: Partial<ShareDraft>) {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...patch });
  }

  clear() {
    this.draft.set(null);
  }
}
