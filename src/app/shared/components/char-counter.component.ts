import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Ring + remaining count, Twitter-style. Turns amber near the limit and red over it. */
@Component({
  selector: 'app-char-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.title]': 'title()' },
  template: `
    @if (max(); as m) {
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border)" stroke-width="2.5" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="2.5"
          stroke-linecap="round"
          [attr.stroke-dasharray]="dash()"
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span class="num tabular" [style.color]="state() === 'ok' ? null : color()">{{ m - count() }}</span>
    } @else {
      <span class="num tabular muted">{{ count() }}</span>
    }
    <span class="sr-only">{{ title() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .num {
      min-width: 2.2em;
      color: var(--muted);
    }
  `,
})
export class CharCounterComponent {
  readonly count = input(0);
  readonly max = input<number | null>(null);

  protected readonly state = computed(() => {
    const m = this.max();
    if (!m) return 'ok';
    const c = this.count();
    if (c > m) return 'over';
    if (c > m * 0.9) return 'near';
    return 'ok';
  });
  protected readonly color = computed(() =>
    this.state() === 'over' ? 'var(--danger)' : this.state() === 'near' ? 'var(--warning)' : 'var(--accent)',
  );
  protected readonly dash = computed(() => {
    const m = this.max() || 1;
    const c = 2 * Math.PI * 8;
    const f = Math.min(1, this.count() / m);
    return `${(f * c).toFixed(2)} ${c.toFixed(2)}`;
  });
  protected readonly title = computed(() => {
    const m = this.max();
    return m ? `${this.count()} of ${m} characters` : `${this.count()} characters`;
  });
}
