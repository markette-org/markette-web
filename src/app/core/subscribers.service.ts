import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Id, Paginated, Subscriber, SubscriberImportResult } from './models';

/** WhatsApp broadcast list of a channel (opt-in subscribers). */
@Injectable({ providedIn: 'root' })
export class SubscribersService {
  private api = inject(ApiService);

  list(channelId: Id, query: { search?: string; active?: boolean; limit?: number; offset?: number } = {}): Observable<Paginated<Subscriber>> {
    return this.api.page<Subscriber>(`channels/${channelId}/subscribers/`, {
      search: query.search,
      active: query.active ? 1 : null,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }
  /** consent must be true: the person agreed to receive WhatsApp messages. */
  add(channelId: Id, address: string, name: string): Observable<SubscriberImportResult> {
    return this.api.post<SubscriberImportResult>(`channels/${channelId}/subscribers/`, { address, name, consent: true });
  }
  /** lines: "phone,name" per line. */
  import(channelId: Id, lines: string): Observable<SubscriberImportResult> {
    return this.api.post<SubscriberImportResult>(`channels/${channelId}/subscribers/`, { lines, consent: true });
  }
  optOut(channelId: Id, subscriberId: Id): Observable<void> {
    return this.api.delete(`channels/${channelId}/subscribers/${subscriberId}/`);
  }
}
