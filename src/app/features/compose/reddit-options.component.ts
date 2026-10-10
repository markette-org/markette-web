import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatError } from '../../core/errors';
import { Channel, RedditFlair, TargetOptions } from '../../core/models';
import { RedditService } from '../../core/reddit.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RedditKind, isRedditProfile, redditDefaultKind, redditRequirements, redditRules, requirementsSummary, subredditLabel } from './reddit';

/** Per-target Reddit options: post type, flair, NSFW/spoiler, reply notifications, subreddit rules. */
@Component({
  selector: 'app-reddit-options',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="options reddit" [disabled]="disabled()">
      <legend>Reddit options · {{ where() }}</legend>

      <div class="field">
        <span class="label" [id]="'rk-' + channel().id">Post type</span>
        @if (kind() === 'image') {
          <span class="chip info"><app-icon name="image" [size]="12" /> Image post (an image is attached)</span>
          <span class="hint">Reddit image posts take one image; the text is shown as the post body where the subreddit allows it.</span>
        } @else {
          <div class="segmented" role="radiogroup" [attr.aria-labelledby]="'rk-' + channel().id">
            <button type="button" role="radio" [attr.aria-checked]="kind() === 'self'" [class.active]="kind() === 'self'" [disabled]="submission() === 'link'" (click)="setKind('self')">
              Text post{{ defaultKind() === 'self' ? ' (default)' : '' }}
            </button>
            <button type="button" role="radio" [attr.aria-checked]="kind() === 'link'" [class.active]="kind() === 'link'" [disabled]="submission() === 'self'" (click)="setKind('link')">
              Link post{{ defaultKind() === 'link' ? ' (default)' : '' }}
            </button>
          </div>
          @if (submission() === 'self') {
            <span class="hint">This subreddit only accepts text posts.</span>
          } @else if (submission() === 'link') {
            <span class="hint">This subreddit only accepts link posts.</span>
          }
          @if (kind() === 'link') {
            <span class="hint">Your text is posted as your first comment under the link.</span>
          }
        }
      </div>

      @if (!profile()) {
        <div class="field">
          <label [for]="'rf-' + channel().id">
            Flair
            @if (req().is_flair_required) {
              <span class="chip warning">required</span>
            }
          </label>
          @if (flairsLoading()) {
            <span class="muted small row"><span class="spinner"></span> Loading flairs…</span>
          } @else if (flairsError()) {
            <div class="row-wrap">
              <span class="danger-text small">{{ flairsError() }}</span>
              <button type="button" class="btn sm" (click)="loadFlairs(true)">Retry</button>
            </div>
          } @else if (flairs().length) {
            <select class="select" [id]="'rf-' + channel().id" [ngModel]="options().flair_id ?? ''" (ngModelChange)="setFlair($event)">
              <option value="">No flair</option>
              @for (f of flairs(); track f.id) {
                <option [value]="f.id">{{ f.text || '(no text)' }}{{ f.editable ? ' ✎' : '' }}</option>
              }
            </select>
            @if (selectedFlair()?.editable) {
              <input
                class="input"
                maxlength="64"
                [attr.aria-label]="'Flair text for ' + where()"
                [ngModel]="options().flair_text ?? ''"
                (ngModelChange)="set('flair_text', $event)"
                [placeholder]="selectedFlair()?.text || 'Flair text'"
              />
            }
          } @else {
            <span class="muted small">This subreddit has no post flairs.</span>
          }
        </div>
      }

      <div class="row-wrap checks">
        @if (cfgNsfw()) {
          <span class="chip danger">This subreddit is NSFW</span>
        }
        <label class="checkbox"><input type="checkbox" [checked]="!!options().nsfw" (change)="set('nsfw', $any($event.target).checked || undefined)" /> NSFW</label>
        <label class="checkbox"><input type="checkbox" [checked]="!!options().spoiler" (change)="set('spoiler', $any($event.target).checked || undefined)" /> Spoiler</label>
        <label class="checkbox">
          <input type="checkbox" [checked]="options().send_replies !== false" (change)="set('send_replies', $any($event.target).checked ? undefined : false)" />
          Send me reply notifications
        </label>
      </div>

      @if (summary().length || rules().length || req().guidelines_text) {
        <details class="rules">
          <summary>Subreddit rules{{ rules().length ? ' (' + rules().length + ')' : '' }}</summary>
          @if (summary().length) {
            <ul class="list-reset req">
              @for (s of summary(); track s) {
                <li><app-icon name="info" [size]="12" /> {{ s }}</li>
              }
            </ul>
          }
          @if (rules().length) {
            <ol class="rule-list small">
              @for (r of rules(); track $index) {
                <li>{{ r }}</li>
              }
            </ol>
          }
          @if (req().guidelines_text) {
            <p class="guidelines pre-wrap small muted">{{ req().guidelines_text }}</p>
          }
        </details>
      }
    </fieldset>
  `,
  styles: `
    .reddit {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .checks {
      gap: 14px;
    }
    .rules summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .req {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 8px 0;
      font-size: 0.82rem;
    }
    .req li {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }
    .rule-list {
      margin: 6px 0;
      padding-left: 20px;
    }
    .guidelines {
      max-height: 160px;
      overflow-y: auto;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--surface-2);
    }
  `,
})
export class RedditOptionsComponent implements OnInit {
  readonly channel = input.required<Channel>();
  readonly options = input.required<TargetOptions>();
  readonly kind = input.required<RedditKind>();
  readonly link = input('');
  readonly disabled = input(false);
  readonly changed = output<{ key: keyof TargetOptions; value: unknown }>();

  private readonly reddit = inject(RedditService);
  protected readonly flairs = signal<RedditFlair[]>([]);
  protected readonly flairsLoading = signal(false);
  protected readonly flairsError = signal('');

  protected readonly profile = computed(() => isRedditProfile(this.channel()));
  protected readonly where = computed(() => (this.profile() ? `u/${(this.channel().config?.['username'] as string) || this.channel().name}` : subredditLabel(this.channel())));
  protected readonly submission = computed(() => (this.channel().config?.['submission_type'] as string) || 'any');
  protected readonly cfgNsfw = computed(() => !!this.channel().config?.['nsfw']);
  protected readonly defaultKind = computed(() => redditDefaultKind(this.link()));
  protected readonly req = computed(() => redditRequirements(this.channel()));
  protected readonly rules = computed(() => redditRules(this.channel()));
  protected readonly summary = computed(() => requirementsSummary(this.req()));
  protected readonly selectedFlair = computed(() => this.flairs().find((f) => f.id === this.options().flair_id) ?? null);

  ngOnInit() {
    if (!this.profile()) this.loadFlairs();
  }

  protected loadFlairs(force = false) {
    this.flairsLoading.set(true);
    this.flairsError.set('');
    this.reddit.flairs(this.channel().id, force).subscribe({
      next: (f) => {
        this.flairs.set(f);
        this.flairsLoading.set(false);
      },
      error: (err) => {
        this.flairsLoading.set(false);
        this.flairsError.set(formatError(err));
      },
    });
  }

  protected set(key: keyof TargetOptions, value: unknown) {
    this.changed.emit({ key, value });
  }

  protected setKind(k: 'self' | 'link') {
    this.set('post_type', k === this.defaultKind() ? undefined : k);
  }

  protected setFlair(id: string) {
    this.set('flair_id', id || undefined);
    const f = this.flairs().find((x) => x.id === id);
    if (!f?.editable) this.set('flair_text', undefined);
  }
}
