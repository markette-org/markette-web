import { Injectable, inject } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { ApiService } from './api.service';
import { Channel, Id, RedditFlair } from './models';

/** Reddit-specific channel actions. */
@Injectable({ providedIn: 'root' })
export class RedditService {
  private api = inject(ApiService);
  private flairCache = new Map<Id, Observable<RedditFlair[]>>();

  /** Post flairs of the channel's subreddit (cached per channel for the session). */
  flairs(channelId: Id, force = false): Observable<RedditFlair[]> {
    if (force || !this.flairCache.has(channelId)) {
      this.flairCache.set(channelId, this.api.get<RedditFlair[]>(`channels/${channelId}/flairs/`).pipe(shareReplay(1)));
    }
    return this.flairCache.get(channelId) ?? of([]);
  }

  /** Adds a subreddit ("python", "r/python" or a reddit URL) as a new channel using this channel's account. */
  addSubreddit(channelId: Id, name: string): Observable<Channel> {
    return this.api.post<Channel>(`channels/${channelId}/add-subreddit/`, { name });
  }
}
