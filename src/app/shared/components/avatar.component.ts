import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { hashColor, initials } from '../utils/format';
import { ProviderIconComponent } from './provider-icon.component';

/** Round avatar with initials fallback and an optional network badge. */
@Component({
  selector: 'app-avatar',
  imports: [ProviderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.--ring]="ring()">
      @if (src() && !failed()) {
        <img [src]="src()" [alt]="''" (error)="failed.set(true)" loading="lazy" referrerpolicy="no-referrer" />
      } @else {
        <span class="initials" [style.background]="bg()" [style.font-size.px]="size() * 0.38">{{ letters() }}</span>
      }
      @if (provider()) {
        <span class="badge"><app-provider-icon [provider]="provider()!" [size]="badgeSize()" /></span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .av {
      position: relative;
      display: inline-block;
      border-radius: 50%;
      box-shadow: 0 0 0 2px var(--ring, transparent);
    }
    img,
    .initials {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 700;
      background: var(--bg-sunken);
    }
    .badge {
      position: absolute;
      right: -3px;
      bottom: -3px;
      border-radius: 30%;
      box-shadow: 0 0 0 2px var(--surface);
      line-height: 0;
    }
  `,
})
export class AvatarComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input<string>('');
  readonly provider = input<string | null>(null);
  readonly size = input(36);
  readonly color = input<string | null>(null);
  /** Optional coloured ring (e.g. channel colour). */
  readonly ring = input<string | null>(null);

  protected readonly failed = signal(false);
  protected readonly letters = computed(() => initials(this.name()));
  protected readonly bg = computed(() => this.color() || hashColor(this.name()));
  protected readonly badgeSize = computed(() => Math.max(12, Math.round(this.size() * 0.42)));
}
