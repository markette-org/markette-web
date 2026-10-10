import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Channel, MediaAsset } from '../../core/models';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { IconComponent } from '../../shared/components/icon.component';

interface Block {
  kind: 'h' | 'p' | 'li';
  parts: { text: string; href?: string; strong?: boolean }[];
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)|\*\*([^*]+)\*\*/g;

/** Tiny Markdown subset for previews: headings, list items, paragraphs, links, bold. */
function inline(text: string): Block['parts'] {
  const out: Block['parts'] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    if (m[1]) out.push({ text: m[1], href: m[2] });
    else if (m[3]) out.push({ text: m[3], href: m[3] });
    else out.push({ text: m[4], strong: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function markdown(src: string): Block[] {
  const blocks: Block[] = [];
  for (const para of src.trim().split(/\n{2,}/)) {
    for (const line of para.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) blocks.push({ kind: 'h', parts: inline(t.replace(/^#+\s*/, '')) });
      else if (/^[-*]\s/.test(t)) blocks.push({ kind: 'li', parts: inline(t.slice(2)) });
      else {
        const prev = blocks[blocks.length - 1];
        // Consecutive plain lines of one paragraph stay together.
        if (prev && prev.kind === 'p' && para.includes(line) && !/^[-*#]/.test(t) && para.split('\n').indexOf(line) > 0)
          prev.parts.push({ text: ' ' }, ...inline(t));
        else blocks.push({ kind: 'p', parts: inline(t) });
      }
    }
  }
  return blocks;
}

/** Previews for email newsletters (Brevo, Listmonk), YouTube videos and Discord messages. */
@Component({
  selector: 'app-special-preview',
  imports: [AvatarComponent, IconComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (flavor()) {
      @case ('email') {
        <article class="email" [attr.aria-label]="'Email preview for ' + channel().name">
          <div class="inbox">
            <app-avatar [src]="channel().avatar_url" [name]="channel().name" [size]="32" />
            <div class="inbox-text">
              <div class="row"><strong class="truncate">{{ channel().name }}</strong><span class="spacer"></span><span class="muted tiny">now</span></div>
              <div class="subject truncate" [class.placeholder]="!title()">{{ title() || 'Email subject' }}</div>
              <div class="pre truncate">{{ preheader() || firstLine() }}</div>
            </div>
          </div>
          <div class="mail">
            @if (hero(); as h) {
              <img class="hero" [src]="h.url" [alt]="h.alt_text || ''" />
            }
            <h3 class="mail-title">{{ title() || 'Email subject' }}</h3>
            @for (b of blocks(); track $index) {
              @switch (b.kind) {
                @case ('h') {
                  <h4><ng-container *ngTemplateOutlet="parts; context: { $implicit: b.parts }" /></h4>
                }
                @case ('li') {
                  <p class="li">• <ng-container *ngTemplateOutlet="parts; context: { $implicit: b.parts }" /></p>
                }
                @default {
                  <p><ng-container *ngTemplateOutlet="parts; context: { $implicit: b.parts }" /></p>
                }
              }
            } @empty {
              <p class="placeholder">Your newsletter text (Markdown) appears here.</p>
            }
            @if (link()) {
              <span class="cta">Read more</span>
            }
            <p class="foot">You receive this email because you subscribed to {{ channel().name }}. <u>Unsubscribe</u></p>
          </div>
        </article>
      }
      @case ('youtube') {
        <article class="yt" [attr.aria-label]="'YouTube preview for ' + channel().name">
          <div class="player">
            @if (video(); as v) {
              <span class="vname tiny">{{ v.original_name }}</span>
            } @else {
              <span class="vname tiny">Add a video</span>
            }
            <span class="play"><svg viewBox="0 0 24 24" width="28" height="28" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
          </div>
          <h3 class="yt-title" [class.placeholder]="!title()">{{ title() || 'Video title' }}</h3>
          <div class="row yt-ch">
            <app-avatar [src]="channel().avatar_url" [name]="channel().name" [size]="28" />
            <strong class="small">{{ channel().name }}</strong>
          </div>
          <p class="yt-desc pre-wrap">{{ descr() || 'The post text becomes the description.' }}</p>
        </article>
      }
      @default {
        <article class="dc" [attr.aria-label]="'Discord preview for ' + channel().name">
          @if (forum()) {
            <div class="thread"><app-icon name="message" [size]="14" /> {{ title() || 'Thread name (title)' }}</div>
          }
          <div class="msg">
            <app-avatar [src]="channel().avatar_url" [name]="botName()" [size]="36" />
            <div class="msg-body">
              <div class="row"><strong>{{ botName() }}</strong><span class="bot">BOT</span><span class="tiny dim">Today</span></div>
              @for (chunk of chunks(); track $index) {
                <p class="pre-wrap chunk">{{ chunk }}</p>
              } @empty {
                <p class="dim">Your message appears here.</p>
              }
              @if (media().length) {
                <div class="atts">
                  @for (m of media().slice(0, 10); track m.id) {
                    @if (m.mime.startsWith('image/')) {
                      <img [src]="m.url" [alt]="m.alt_text || ''" />
                    } @else {
                      <span class="file tiny">{{ m.original_name }}</span>
                    }
                  }
                </div>
              }
            </div>
          </div>
          @if (chunks().length > 1) {
            <p class="tiny dim">Sent as {{ chunks().length }} messages (2,000 characters each).</p>
          }
        </article>
      }
    }

    <ng-template #parts let-parts>
      @for (p of parts; track $index) {
        @if (p.href) {
          <a class="lnk">{{ p.text }}</a>
        } @else if (p.strong) {
          <strong>{{ p.text }}</strong>
        } @else {
          <span>{{ p.text }}</span>
        }
      }
    </ng-template>
  `,
  styleUrl: './special-preview.component.scss',
})
export class SpecialPreviewComponent {
  readonly channel = input.required<Channel>();
  readonly body = input('');
  readonly title = input('');
  readonly link = input('');
  readonly media = input<MediaAsset[]>([]);
  readonly preheader = input('');
  readonly forum = input(false);

  protected readonly flavor = computed(() => {
    const p = this.channel().provider;
    if (p === 'brevo' || p === 'listmonk') return 'email';
    if (p === 'youtube') return 'youtube';
    return 'discord';
  });

  protected readonly blocks = computed(() => markdown(this.body()));
  protected readonly firstLine = computed(() => this.body().trim().split('\n')[0]?.replace(/[#*_>`]/g, '').slice(0, 120) ?? '');
  /** Hero = first image unless its URL already appears in the text (backend rule). */
  protected readonly hero = computed(() => {
    const img = this.media().find((m) => m.mime.startsWith('image/'));
    return img && !this.body().includes(img.url) ? img : null;
  });
  protected readonly video = computed(() => this.media().find((m) => m.mime.startsWith('video/')) ?? null);
  protected readonly descr = computed(() => {
    const t = this.body().trim();
    return t.length > 280 ? t.slice(0, 280).trimEnd() + '…' : t;
  });
  protected readonly botName = computed(() => {
    const u = this.channel().config?.['username'];
    return typeof u === 'string' && u ? u : this.channel().name;
  });
  protected readonly chunks = computed(() => {
    const t = this.body().trim();
    const out: string[] = [];
    for (let i = 0; i < t.length && out.length < 3; i += 2000) out.push(t.slice(i, i + 2000));
    return out;
  });
}
