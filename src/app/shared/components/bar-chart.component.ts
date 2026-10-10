import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { fmtNumber } from '../utils/format';

export interface BarDatum {
  label: string; // x label (short)
  title?: string; // tooltip heading
  value: number;
}

/** Single-series vertical bar chart with gridlines and a hover tooltip. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" (mouseleave)="hover.set(-1)">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
        @for (g of grid(); track g.y) {
          <line [attr.x1]="PAD_L" [attr.x2]="W" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" vector-effect="non-scaling-stroke" />
        }
        @for (b of bars(); track $index) {
          <path [attr.d]="b.d" [attr.fill]="color()" [attr.opacity]="hover() === -1 || hover() === $index ? 1 : 0.45" />
          <rect
            [attr.x]="b.slotX"
            y="0"
            [attr.width]="b.slotW"
            [attr.height]="H - PAD_B"
            fill="transparent"
            (mouseenter)="hover.set($index)"
          />
        }
        <line [attr.x1]="PAD_L" [attr.x2]="W" [attr.y1]="H - PAD_B" [attr.y2]="H - PAD_B" class="axis" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="y-labels">
        @for (g of grid(); track g.y) {
          <span [style.top.%]="(g.y / H) * 100">{{ g.label }}</span>
        }
      </div>
      <div class="x-labels">
        @for (b of bars(); track $index) {
          @if (b.showLabel) {
            <span [style.left.%]="((b.slotX + b.slotW / 2) / W) * 100">{{ b.label }}</span>
          }
        }
      </div>
      @if (hover() >= 0 && bars()[hover()]; as b) {
        <div class="tip" [style.left.%]="((b.slotX + b.slotW / 2) / W) * 100" [style.top.%]="(b.y / H) * 100">
          <div class="tip-title">{{ b.title }}</div>
          <div class="tip-value">{{ fmt(b.value) }} <span class="muted">{{ unit() }}</span></div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      position: relative;
      height: var(--chart-h, 200px);
      padding-left: 36px;
      padding-bottom: 20px;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }
    .grid {
      stroke: var(--border);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    .axis {
      stroke: var(--border-strong);
      stroke-width: 1;
    }
    .y-labels span {
      position: absolute;
      left: 0;
      width: 30px;
      text-align: right;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .y-labels {
      position: absolute;
      inset: 0 auto 20px 0;
      width: 36px;
    }
    .x-labels {
      position: absolute;
      left: 36px;
      right: 0;
      bottom: 0;
      height: 18px;
    }
    .x-labels span {
      position: absolute;
      transform: translateX(-50%);
      font-size: 0.7rem;
      color: var(--muted);
      white-space: nowrap;
    }
    .tip {
      position: absolute;
      transform: translate(-50%, calc(-100% - 8px));
      margin-left: 18px;
      background: var(--text);
      color: var(--surface);
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: var(--shadow-md);
      z-index: 2;
    }
    .tip-title {
      opacity: 0.75;
    }
    .tip-value {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .tip .muted {
      color: inherit;
      opacity: 0.7;
      font-weight: 500;
    }
  `,
})
export class BarChartComponent {
  readonly data = input<BarDatum[]>([]);
  readonly color = input('var(--accent)');
  readonly unit = input('');
  readonly label = input('Bar chart');

  protected readonly W = 600;
  protected readonly H = 200;
  protected readonly PAD_L = 0;
  protected readonly PAD_B = 0;
  protected readonly hover = signal(-1);
  protected readonly fmt = (v: number) => fmtNumber(v);

  private readonly max = computed(() => niceMax(Math.max(0, ...this.data().map((d) => d.value))));

  protected readonly grid = computed(() => {
    const max = this.max();
    return [0, 0.5, 1].map((f) => ({ y: this.H - this.PAD_B - f * (this.H - this.PAD_B - 8), label: fmtNumber(max * f) }));
  });

  protected readonly bars = computed(() => {
    const data = this.data();
    const n = data.length || 1;
    const slotW = this.W / n;
    const barW = Math.max(2, Math.min(28, slotW * 0.66));
    const max = this.max();
    const base = this.H - this.PAD_B;
    const usable = base - 8;
    const every = Math.ceil(n / 8);
    return data.map((d, i) => {
      const h = max ? (d.value / max) * usable : 0;
      const x = i * slotW + (slotW - barW) / 2;
      const y = base - h;
      const r = Math.min(4, barW / 2, h);
      // Rounded top, square base anchored to the axis.
      const path =
        h <= 0
          ? ''
          : `M${x},${base} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${base} Z`;
      return {
        d: path,
        y,
        slotX: i * slotW,
        slotW,
        value: d.value,
        label: d.label,
        title: d.title ?? d.label,
        showLabel: i % every === 0,
      };
    });
  });
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}
