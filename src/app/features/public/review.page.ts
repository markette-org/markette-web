import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { fieldErrors, formatError } from '../../core/errors';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';

interface ReviewData {
  workspace: string;
  label: string;
  expires_at: string;
  timezone: string;
  post: { title: string; body: string; link: string; approval_status: string; media: { url: string; mime: string; alt: string }[] };
  channels: { name: string; provider: string; provider_label: string; title: string; body: string; status: string; when: string | null }[];
  reviews: { action: string; comment: string; by: string; created_at: string }[];
}

/** Opened by a client from a review link: no account, no app chrome. */
@Component({
  selector: 'app-review-page',
  imports: [FormsModule, IconComponent, ProviderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="public">
      @if (error()) {
        <div class="card stack center">
          <app-icon name="lock" [size]="28" />
          <h1>Link unavailable</h1>
          <p class="muted">{{ error() }}</p>
        </div>
      } @else if (page(); as p) {
        <header class="head">
          <div class="eyebrow">{{ p.workspace }} · review</div>
          <h1>{{ p.post.title || 'A post for your approval' }}</h1>
          <p class="muted small">Check how it will look on each channel, then approve it or say what should change.</p>
          @switch (p.post.approval_status) {
            @case ('approved') {
              <div class="notice success"><app-icon name="check" [size]="16" /><span>Approved. Thank you!</span></div>
            }
            @case ('changes_requested') {
              <div class="notice warning"><app-icon name="edit" [size]="16" /><span>Changes requested. The team has been told.</span></div>
            }
          }
        </header>

        @if (p.post.media.length) {
          <div class="media">
            @for (m of p.post.media; track m.url) {
              @if (m.mime.startsWith('video/')) {
                <video [src]="m.url" controls preload="metadata"></video>
              } @else {
                <img [src]="m.url" [alt]="m.alt" loading="lazy" />
              }
            }
          </div>
        }

        <div class="channels">
          @for (c of p.channels; track $index) {
            <article class="card stack-sm">
              <div class="row">
                <app-provider-icon [provider]="c.provider" [size]="20" />
                <strong>{{ c.name }}</strong>
                <span class="muted small">{{ c.provider_label }}</span>
                <span class="spacer"></span>
                @if (c.when) {
                  <span class="small muted">{{ c.status === 'published' ? 'Published' : 'Planned' }} {{ fmt(c.when, p.timezone) }}</span>
                }
              </div>
              @if (c.title) {
                <h2 class="ctitle">{{ c.title }}</h2>
              }
              <p class="pre-wrap">{{ c.body }}</p>
            </article>
          }
        </div>

        @if (p.reviews.length) {
          <section class="card stack-sm">
            <h2 class="h">History</h2>
            @for (r of p.reviews; track $index) {
              <p class="small">
                <strong>{{ r.by || 'Team' }}</strong> {{ label(r.action) }} · <span class="muted">{{ fmt(r.created_at, p.timezone) }}</span>
                @if (r.comment) {
                  <span class="block pre-wrap">{{ r.comment }}</span>
                }
              </p>
            }
          </section>
        }

        <form class="card stack" (ngSubmit)="decide('approve')">
          <h2 class="h">Your decision</h2>
          <div class="field">
            <label for="rv-name">Your name</label>
            <input id="rv-name" name="name" class="input" [(ngModel)]="name" [placeholder]="p.label || 'Name'" autocomplete="name" />
          </div>
          <div class="field">
            <label for="rv-comment">Comment</label>
            <textarea id="rv-comment" name="comment" class="textarea" rows="3" [(ngModel)]="comment" placeholder="Required when you ask for changes"></textarea>
            @if (fe()['comment']) {
              <span class="error">{{ fe()['comment'] }}</span>
            }
          </div>
          <div class="row-wrap">
            <button type="submit" class="btn primary" [disabled]="busy()"><app-icon name="check" [size]="16" /> Approve</button>
            <button type="button" class="btn" (click)="decide('changes')" [disabled]="busy()"><app-icon name="edit" [size]="16" /> Ask for changes</button>
          </div>
          <p class="hint">Asking for changes stops it from being published until the team schedules it again.</p>
        </form>
        <p class="tiny muted center">This link works until {{ fmt(p.expires_at, p.timezone) }}. Sent with Markette.</p>
      } @else {
        <div class="center"><span class="spinner"></span></div>
      }
    </main>
  `,
  styles: `
    .public {
      max-width: 760px;
      margin: 0 auto;
      padding: 32px 16px 48px;
      display: grid;
      gap: 16px;
    }
    .center {
      text-align: center;
      justify-items: center;
    }
    .head h1 {
      margin: 4px 0;
    }
    .media {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }
    .media img,
    .media video {
      width: 100%;
      border-radius: 10px;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: var(--surface-2, #0001);
    }
    .channels {
      display: grid;
      gap: 12px;
    }
    .ctitle,
    .h {
      font-size: 1rem;
      margin: 0;
    }
  `,
})
export class ReviewPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly page = signal<ReviewData | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected name = '';
  protected comment = '';
  private token = '';

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.api.get<ReviewData>(`public/review/${this.token}/`).subscribe({
      next: (p) => this.page.set(p),
      error: (err) => this.error.set(formatError(err, 'This review link has expired or was withdrawn.')),
    });
  }

  protected decide(decision: 'approve' | 'changes') {
    this.busy.set(true);
    this.fe.set({});
    this.api.post<ReviewData>(`public/review/${this.token}/`, { decision, name: this.name, comment: this.comment }).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.page.set(p);
        this.comment = '';
      },
      error: (err) => {
        this.busy.set(false);
        this.fe.set(fieldErrors(err).fields);
        if (!Object.keys(fieldErrors(err).fields).length) this.error.set(formatError(err));
      },
    });
  }

  protected label(action: string) {
    return { approved: 'approved', changes_requested: 'asked for changes', submitted: 'submitted it for review' }[action] ?? action;
  }

  protected fmt(iso: string, tz: string) {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  }
}
