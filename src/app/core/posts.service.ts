import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, Query } from './api.service';
import {
  AdaptResponse,
  ApprovedPost,
  PostReview,
  CalendarItem,
  Id,
  MediaAsset,
  Paginated,
  PlanPayload,
  PlanResponse,
  Post,
  PostWrite,
  SchedulePayload,
  SuggestPayload,
  SuggestResponse,
  Target,
  ValidationProblems,
} from './models';

/** Typed calls for posts, targets, media, calendar and AI insights. */
@Injectable({ providedIn: 'root' })
export class PostsService {
  private api = inject(ApiService);
  private http = inject(HttpClient);

  list(query: Query = {}): Observable<Paginated<Post>> {
    return this.api.page<Post>('posts/', { limit: 25, ...query });
  }
  get(id: Id): Observable<Post> {
    return this.api.get<Post>(`posts/${id}/`);
  }
  create(data: PostWrite): Observable<Post> {
    return this.api.post<Post>('posts/', data);
  }
  update(id: Id, data: PostWrite): Observable<Post> {
    return this.api.patch<Post>(`posts/${id}/`, data);
  }
  remove(id: Id): Observable<void> {
    return this.api.delete(`posts/${id}/`);
  }
  schedule(id: Id, payload: SchedulePayload): Observable<Post> {
    return this.api.post<Post>(`posts/${id}/schedule/`, payload);
  }
  /** Like schedule() but exposes the status: 202 = submitted for review, nothing scheduled yet. */
  scheduleWithStatus(id: Id, payload: SchedulePayload): Observable<HttpResponse<Post>> {
    return this.http.post<Post>(this.api.url(`posts/${id}/schedule/`), payload, { observe: 'response' });
  }
  approve(id: Id, comment = ''): Observable<ApprovedPost> {
    return this.api.post<ApprovedPost>(`posts/${id}/approve/`, { comment });
  }
  requestChanges(id: Id, comment: string): Observable<Post> {
    return this.api.post<Post>(`posts/${id}/request-changes/`, { comment });
  }
  reviews(id: Id): Observable<PostReview[]> {
    return this.api.get<PostReview[]>(`posts/${id}/reviews/`);
  }
  unschedule(id: Id): Observable<Post> {
    return this.api.post<Post>(`posts/${id}/unschedule/`);
  }
  validate(id: Id): Observable<ValidationProblems> {
    return this.api.get<ValidationProblems>(`posts/${id}/validate/`);
  }
  retry(id: Id): Observable<Post> {
    return this.api.post<Post>(`posts/${id}/retry/`);
  }
  duplicate(id: Id): Observable<Post> {
    return this.api.post<Post>(`posts/${id}/duplicate/`);
  }

  /* targets */
  updateTarget(id: Id, patch: Partial<Pick<Target, 'body' | 'title' | 'media_ids' | 'options'>>): Observable<Target> {
    return this.api.patch<Target>(`targets/${id}/`, patch);
  }
  reschedule(id: Id, scheduledAt: string): Observable<Target> {
    return this.api.post<Target>(`targets/${id}/reschedule/`, { scheduled_at: scheduledAt });
  }
  cancelTarget(id: Id): Observable<Target> {
    return this.api.post<Target>(`targets/${id}/cancel/`);
  }
  /** Settles an unconfirmed publication: live (with the address found, if any) or not posted (publish again). */
  resolveTarget(id: Id, published: boolean, url = ''): Observable<Target> {
    return this.api.post<Target>(`targets/${id}/resolve/`, published ? { published, url } : { published });
  }
  deleteRemote(id: Id): Observable<Target> {
    return this.api.post<Target>(`targets/${id}/delete-remote/`);
  }

  /* media */
  upload(file: File, altText = ''): Observable<MediaAsset> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (altText) form.append('alt_text', altText);
    return this.api.post<MediaAsset>('media/', form);
  }
  updateMedia(id: Id, altText: string): Observable<MediaAsset> {
    return this.api.patch<MediaAsset>(`media/${id}/`, { alt_text: altText });
  }
  deleteMedia(id: Id): Observable<void> {
    return this.api.delete(`media/${id}/`);
  }

  /* calendar */
  calendar(start: string, end: string, channels?: Id[], campaign?: Id | null, team?: Id | null): Observable<CalendarItem[]> {
    return this.api.get<CalendarItem[]>('calendar/', {
      start,
      end,
      channels: channels ?? [],
      campaign: campaign ?? null,
      team: team ?? null,
    });
  }

  /* insights */
  suggest(payload: SuggestPayload): Observable<SuggestResponse> {
    return this.api.post<SuggestResponse>('insights/suggest/', payload);
  }
  plan(payload: PlanPayload): Observable<PlanResponse> {
    return this.api.post<PlanResponse>('insights/plan/', payload);
  }
  adapt(payload: { channels: Id[]; body: string; title?: string; instructions?: string }): Observable<AdaptResponse> {
    return this.api.post<AdaptResponse>('insights/adapt/', payload);
  }
}
