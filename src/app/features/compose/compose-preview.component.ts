import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Channel, MediaAsset } from '../../core/models';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { providerMeta } from '../../shared/utils/providers';

interface Seg {
  text: string;
  kind: 'text' | 'link' | 'tag' | 'mention';
}

const TOKEN_RE = /(https?:\/\/[^\s<>"']+)|((?:^|(?<=\s))#[\p{L}\p{N}_]+)|((?:^|(?<=\s))@[\w.-]+(?:@[\w.-]+)?)/gu;

/** Network-flavoured preview card for one channel. */
function tokenize(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), kind: 'text' });
    out.push({ text: m[0], kind: m[1] ? 'link' : m[2] ? 'tag' : 'mention' });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'text' });
  return out;
}

@Component({
  selector: 'app-compose-preview',
  imports: [AvatarComponent, ProviderIconComponent, IconComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="pv {{ flavor() }}" [attr.aria-label]="'Preview for ' + channel().name">
      <header class="pv-head">
        <app-avatar [src]="channel().avatar_url" [name]="channel().name" [size]="flavor() === 'blog' ? 28 : 38" />
        <div class="who">
          <div class="name truncate">{{ channel().name }}</div>
          <div class="meta truncate">{{ handleLine() }}</div>
        </div>
        <app-provider-icon [provider]="channel().provider" [size]="18" />
      </header>

      @if (flavor() === 'instagram' && media().length) {
        <div class="ig-media">
          <ng-container [ngTemplateOutlet]="mediaTpl" />
        </div>
      }

      @if (flavor() === 'blog') {
        <h3 class="blog-title" [class.placeholder]="!title()">{{ title() || 'Untitled post' }}</h3>
        @if (media().length) {
          <div class="blog-cover"><ng-container [ngTemplateOutlet]="mediaTpl" /></div>
        }
      }

      <div class="body" [class.collapsed]="truncateAt() && !!bodyText()">
        @if (bodyText()) {
          @if (flavor() === 'instagram') {
            <strong>{{ handle() }}</strong>&nbsp;
          }
          @for (s of segments(); track $index) {
            @switch (s.kind) {
              @case ('text') {
                <span>{{ s.text }}</span>
              }
              @default {
                <span class="tok">{{ s.text }}</span>
              }
            }
          }
          @if (cut()) {
            <span class="more">… see more</span>
          }
        } @else {
          <span class="placeholder">Your text will appear here.</span>
        }
      </div>

      @if (flavor() !== 'instagram' && flavor() !== 'blog' && media().length) {
        <div class="media-wrap"><ng-container [ngTemplateOutlet]="mediaTpl" /></div>
      }

      @if (link() && !media().length && flavor() !== 'blog') {
        <div class="link-card">
          <app-icon name="link" [size]="14" />
          <span class="truncate">{{ linkHost() }}</span>
        </div>
      }

      <footer class="pv-foot" aria-hidden="true">
        @switch (flavor()) {
          @case ('x') {
            <span><app-icon name="message" [size]="14" /></span><span><app-icon name="repeat" [size]="14" /></span><span><app-icon name="heart" [size]="14" /></span><span><app-icon name="bookmark" [size]="14" /></span>
          }
          @case ('linkedin') {
            <span><app-icon name="heart" [size]="14" /> Like</span><span><app-icon name="message" [size]="14" /> Comment</span><span><app-icon name="repeat" [size]="14" /> Repost</span>
          }
          @case ('blog') {
            <span class="muted tiny">{{ channel().base_url || 'Blog post' }}</span>
          }
          @default {
            <span><app-icon name="heart" [size]="14" /></span><span><app-icon name="message" [size]="14" /></span><span><app-icon name="repeat" [size]="14" /></span>
          }
        }
      </footer>
      @if (firstComment()) {
        <div class="fc" aria-label="First comment">
          <app-avatar [src]="channel().avatar_url" [name]="channel().name" [size]="26" />
          <div class="fc-bubble">
            <div class="fc-head"><strong>{{ channel().name }}</strong><span class="fc-label">First comment</span></div>
            <div class="fc-text">
              @for (s of commentSegments(); track $index) {
                @if (s.kind === 'text') {
                  <span>{{ s.text }}</span>
                } @else {
                  <span class="tok">{{ s.text }}</span>
                }
              }
            </div>
          </div>
        </div>
      }
    </article>

    <ng-template #mediaTpl>
      <div class="grid-media n{{ shownMedia().length }}">
        @for (m of shownMedia(); track m.id) {
          @if (m.mime.startsWith('video/')) {
            <div class="vid"><app-icon name="video" [size]="22" /><span class="tiny">{{ m.original_name }}</span></div>
          } @else {
            <img [src]="m.url" [alt]="m.alt_text || ''" loading="lazy" />
          }
        }
      </div>
    </ng-template>
  `,
  styleUrl: './compose-preview.component.scss',
})
export class ComposePreviewComponent {
  readonly channel = input.required<Channel>();
  readonly body = input('');
  readonly title = input('');
  readonly link = input('');
  readonly media = input<MediaAsset[]>([]);
  readonly maxMedia = input(4);
  /** Final first comment (own text + moved links), rendered under the post. */
  readonly firstComment = input('');

  protected readonly commentSegments = computed<Seg[]>(() => tokenize(this.firstComment().trim()));

  protected readonly flavor = computed(() => {
    const p = this.channel().provider;
    if (providerMeta(p).kind === 'blog') return 'blog';
    if (p === 'threads') return 'x';
    if (p === 'x' || p === 'linkedin' || p === 'instagram' || p === 'whatsapp') return p;
    return 'social';
  });

  protected readonly handle = computed(() => (this.channel().handle || this.channel().name).replace(/^@/, ''));
  protected readonly handleLine = computed(() => {
    const ch = this.channel();
    switch (this.flavor()) {
      case 'linkedin':
        return 'Now · 🌐';
      case 'blog':
        return providerMeta(ch.provider).label;
      case 'whatsapp':
        return 'Broadcast · template message';
      default:
        return ch.handle ? '@' + ch.handle.replace(/^@/, '') + ' · now' : 'now';
    }
  });

  protected readonly truncateAt = computed(() => (this.flavor() === 'linkedin' ? 210 : this.flavor() === 'instagram' ? 125 : this.flavor() === 'blog' ? 320 : 0));
  protected readonly bodyText = computed(() => this.body().trim());
  protected readonly cut = computed(() => {
    const n = this.truncateAt();
    return !!n && this.bodyText().length > n;
  });
  protected readonly segments = computed<Seg[]>(() => {
    let text = this.bodyText();
    if (this.cut()) text = text.slice(0, this.truncateAt()).trimEnd();
    const out: Seg[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ text: text.slice(last, i), kind: 'text' });
      out.push({ text: m[0], kind: m[1] ? 'link' : m[2] ? 'tag' : 'mention' });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), kind: 'text' });
    return out;
  });
  protected readonly shownMedia = computed(() => this.media().slice(0, Math.min(4, this.maxMedia() || 4)));
  protected readonly linkHost = computed(() => {
    try {
      return new URL(this.link()).host;
    } catch {
      return this.link();
    }
  });
}
