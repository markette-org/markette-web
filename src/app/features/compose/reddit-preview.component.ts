import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Channel, MediaAsset, TargetOptions } from '../../core/models';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { IconComponent } from '../../shared/components/icon.component';
import { isRedditProfile, subredditLabel } from './reddit';

/** Reddit-style post card for the compose preview. */
@Component({
  selector: 'app-reddit-preview',
  imports: [AvatarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="rd" [attr.aria-label]="'Preview for ' + where()">
      <header class="rd-head">
        <app-avatar [src]="channel().avatar_url" [name]="where()" [size]="24" />
        <strong class="small">{{ where() }}</strong>
        <span class="muted tiny">· Posted by u/{{ username() }} · now</span>
      </header>
      <h3 class="rd-title" [class.placeholder]="!title()">{{ title() || 'Your title (required)' }}</h3>
      <div class="tags">
        @if (flairText()) {
          <span class="flair">{{ flairText() }}</span>
        }
        @if (options().nsfw) {
          <span class="tag nsfw">NSFW</span>
        }
        @if (options().spoiler) {
          <span class="tag spoiler">Spoiler</span>
        }
      </div>
      @switch (kind()) {
        @case ('image') {
          @if (media()[0]; as m) {
            <img class="rd-img" [src]="m.url" [alt]="m.alt_text || ''" loading="lazy" />
          }
          @if (body().trim()) {
            <p class="rd-body pre-wrap">{{ body() }}</p>
          }
        }
        @case ('link') {
          <div class="rd-link">
            <app-icon name="link" [size]="14" />
            <span class="truncate">{{ host() || 'Add a link' }}</span>
            <app-icon name="external" [size]="12" />
          </div>
        }
        @default {
          @if (body().trim()) {
            <p class="rd-body pre-wrap">{{ body() }}</p>
          }
        }
      }
      <footer class="rd-bar" aria-hidden="true">
        <span class="votes"><app-icon name="arrowUp" [size]="14" /> 1</span>
        <span><app-icon name="message" [size]="14" /> {{ firstComment() ? 1 : 0 }} comments</span>
        <span><app-icon name="repeat" [size]="14" /> Share</span>
      </footer>
      @if (firstComment()) {
        <div class="rd-comment">
          <div class="row">
            <strong class="tiny">u/{{ username() }}</strong>
            <span class="chip accent" style="height: 18px; font-size: 0.65rem">OP</span>
            <span class="muted tiny">First comment</span>
          </div>
          <p class="pre-wrap small">{{ firstComment() }}</p>
        </div>
      }
    </article>
  `,
  styles: `
    .rd {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 0.9rem;
    }
    .rd-head {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .rd-title {
      font-size: 1.05rem;
      line-height: 1.3;
    }
    .rd-title.placeholder {
      color: var(--faint);
      font-weight: 600;
    }
    .tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tags:empty {
      display: none;
    }
    .flair {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-sunken);
    }
    .tag {
      font-size: 0.68rem;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid currentColor;
    }
    .nsfw {
      color: #d93a4a;
    }
    .spoiler {
      color: var(--muted);
    }
    .rd-img {
      width: 100%;
      max-height: 320px;
      object-fit: contain;
      border-radius: 8px;
      background: var(--bg-sunken);
    }
    .rd-body {
      color: var(--text-2);
      max-height: 220px;
      overflow: hidden;
    }
    .rd-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: #0079d3;
      font-size: 0.82rem;
    }
    .rd-bar {
      display: flex;
      gap: 16px;
      color: var(--muted);
      font-size: 0.78rem;
    }
    .rd-bar span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .votes {
      color: #ff4500;
      font-weight: 700;
    }
    .rd-comment {
      border-left: 2px solid var(--border);
      padding: 4px 0 4px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class RedditPreviewComponent {
  readonly channel = input.required<Channel>();
  readonly title = input('');
  readonly body = input('');
  readonly kind = input<'self' | 'link' | 'image'>('self');
  readonly link = input('');
  readonly media = input<MediaAsset[]>([]);
  readonly options = input<TargetOptions>({});
  readonly firstComment = input('');

  protected readonly where = computed(() =>
    isRedditProfile(this.channel()) ? `u/${this.username()}` : subredditLabel(this.channel()),
  );
  protected readonly username = computed(
    () => (this.channel().config?.['username'] as string) || this.channel().handle?.replace(/^u\//, '') || 'you',
  );
  protected readonly flairText = computed(() => this.options().flair_text || '');
  protected readonly host = computed(() => {
    try {
      return new URL(this.link()).host.replace(/^www\./, '');
    } catch {
      return this.link();
    }
  });
}
