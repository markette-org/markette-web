import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { InboxSummary } from './models';

/** Unread inbox count for the menu badge, refreshed by the shell and the inbox page. */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly api = inject(ApiService);
  readonly summary = signal<InboxSummary | null>(null);

  refresh() {
    this.api.get<InboxSummary>('inbox/summary/').subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
  }
}
