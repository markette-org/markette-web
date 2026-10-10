import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Channel } from '../../core/models';
import { channelColor } from '../utils/providers';
import { AvatarComponent } from './avatar.component';

/** Avatar + name (+ handle) for a channel. */
@Component({
  selector: 'app-channel-badge',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (channel(); as ch) {
      <app-avatar [src]="ch.avatar_url" [name]="ch.name" [provider]="ch.provider" [size]="size()" [ring]="ring() ? color() : null" />
      <span class="text">
        <span class="name truncate">{{ ch.name }}</span>
        @if (showHandle() && ch.handle) {
          <span class="handle truncate">{{ ch.handle.startsWith('@') ? ch.handle : '@' + ch.handle }}</span>
        }
      </span>
    } @else {
      <span class="muted small">{{ fallback() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.25;
    }
    .name {
      font-weight: 600;
      font-size: 0.9rem;
    }
    .handle {
      font-size: 0.78rem;
      color: var(--muted);
    }
  `,
})
export class ChannelBadgeComponent {
  readonly channel = input<Channel | null | undefined>(null);
  readonly size = input(28);
  readonly showHandle = input(true);
  readonly ring = input(false);
  readonly fallback = input('Removed channel');
  protected readonly color = computed(() => channelColor(this.channel()));
}
