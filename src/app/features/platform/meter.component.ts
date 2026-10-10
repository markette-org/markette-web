import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { fmtNumber } from '../../shared/utils/format';

/** "used / limit" with a thin bar; null limit = unlimited. */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter" [attr.title]="label() ? label() + ': ' + text() : text()">
      <div class="m-text tabular">
        @if (label()) {
          <span class="m-label">{{ label() }}</span>
        }
        <span>{{ text() }}</span>
      </div>
      @if (limit() !== null && limit() !== undefined) {
        <div class="bar" role="meter" [attr.aria-valuenow]="used()" aria-valuemin="0" [attr.aria-valuemax]="limit()" [attr.aria-label]="label() || 'Usage'">
          <span [style.width.%]="pct()" [class.warn]="pct() >= 80" [class.over]="pct() >= 100"></span>
        </div>
      }
    </div>
  `,
  styles: `
    .meter {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 90px;
    }
    .m-text {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .m-label {
      color: var(--muted);
    }
    .bar {
      height: 5px;
      border-radius: 3px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--accent);
    }
    .bar span.warn {
      background: var(--warning);
    }
    .bar span.over {
      background: var(--danger);
    }
  `,
})
export class MeterComponent {
  readonly used = input(0);
  readonly limit = input<number | null | undefined>(null);
  readonly label = input('');
  protected readonly pct = computed(() => {
    const l = this.limit();
    if (!l) return this.used() > 0 ? 100 : 0;
    return Math.min(100, (this.used() / l) * 100);
  });
  protected readonly text = computed(() => {
    const l = this.limit();
    return l === null || l === undefined ? `${fmtNumber(this.used())} · Unlimited` : `${fmtNumber(this.used())} / ${fmtNumber(l)}`;
  });
}
