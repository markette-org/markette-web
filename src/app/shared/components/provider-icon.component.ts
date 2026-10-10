import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { providerMeta } from '../utils/providers';

/** Small brand-coloured network mark. */
@Component({
  selector: 'app-provider-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="mark"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="meta().color"
      [style.color]="meta().ink"
      [style.font-size.px]="fontSize()"
      [attr.title]="meta().label"
      role="img"
      [attr.aria-label]="meta().label"
    >
      @switch (provider()) {
        @case ('instagram') {
          <svg viewBox="0 0 24 24" [attr.width]="size() * 0.66" [attr.height]="size() * 0.66" fill="none" stroke="currentColor" stroke-width="2.4">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
          </svg>
        }
        @case ('bluesky') {
          <svg viewBox="0 0 24 24" [attr.width]="size() * 0.66" [attr.height]="size() * 0.66" fill="currentColor">
            <path d="M5.6 3.6C8 5.4 10.6 9 11.6 11c1-2 3.6-5.6 6-7.4 1.7-1.3 4.5-2.3 4.5.9 0 .6-.4 5.3-.6 6-.7 2.6-3.3 3.2-5.6 2.8 4 .7 5 3 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5l-.6-1.3-.6 1.3c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.2-1.2-4.5 2.8-5.2-2.3.4-4.9-.2-5.6-2.8C1.4 9.8 1 5 1 4.5c0-3.2 2.8-2.2 4.6-.9Z" />
          </svg>
        }
        @default {
          <span class="glyph">{{ meta().mark }}</span>
        }
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .mark {
      display: inline-grid;
      place-items: center;
      border-radius: 28%;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }
    .glyph {
      transform: translateY(-0.02em);
    }
  `,
})
export class ProviderIconComponent {
  readonly provider = input.required<string>();
  readonly size = input(18);
  protected readonly meta = computed(() => providerMeta(this.provider()));
  protected readonly fontSize = computed(() => {
    const len = this.meta().mark.length;
    return Math.round(this.size() * (len > 2 ? 0.36 : len === 2 ? 0.5 : 0.62));
  });
}
