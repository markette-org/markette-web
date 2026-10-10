import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { fmtNumber } from '../utils/format';
import { niceMax } from './bar-chart.component';

export interface LineSeries {
  name: string;
  color: string;
  /** x is a timestamp (ms) or any increasing number */
  points: { x: number; y: number }[];
}

/** Multi-series line chart (one shared y-axis) with crosshair tooltip and legend. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (series().length > 1 && legend()) {
      <ul class="legend list-reset">
        @for (s of series(); track s.name) {
          <li><span class="sw" [style.background]="s.color"></span>{{ s.name }}</li>
        }
      </ul>
    }
    <div class="chart" #box (mousemove)="move($event)" (mouseleave)="hoverX.set(null)">
      @if (hasData()) {
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
          @for (g of grid(); track g.y) {
            <line x1="0" [attr.x2]="W" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" vector-effect="non-scaling-stroke" />
          }
          @for (p of paths(); track p.name) {
            <path [attr.d]="p.d" fill="none" [attr.stroke]="p.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          }
          @if (hover(); as h) {
            <line [attr.x1]="h.px" [attr.x2]="h.px" y1="0" [attr.y2]="H" class="cross" vector-effect="non-scaling-stroke" />
          }
        </svg>
        @if (hover(); as h) {
          @for (d of h.dots; track d.name) {
            <span class="dot" [style.left.%]="(h.px / W) * 100" [style.top.%]="(d.py / H) * 100" [style.background]="d.color"></span>
          }
          <div class="tip" [style.left.%]="(h.px / W) * 100" [class.flip]="h.px > W * 0.65">
            <div class="tip-title">{{ h.label }}</div>
            @for (d of h.dots; track d.name) {
              <div class="tip-row"><span class="sw" [style.background]="d.color"></span>{{ d.name }} <b>{{ fmt(d.y) }}</b></div>
            }
          </div>
        }
        <div class="y-labels">
          @for (g of grid(); track g.y) {
            <span [style.top.%]="(g.y / H) * 100">{{ g.label }}</span>
          }
        </div>
        <div class="x-labels">
          <span>{{ xLabels()[0] }}</span><span>{{ xLabels()[1] }}</span>
        </div>
      } @else {
        <div class="nodata muted small">{{ emptyText() }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      font-size: 0.78rem;
      color: var(--text-2);
      margin-bottom: 10px;
    }
    .legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sw {
      width: 10px;
      height: 3px;
      border-radius: 2px;
      display: inline-block;
    }
    .chart {
      position: relative;
      height: var(--chart-h, 180px);
      margin-left: 40px;
      margin-bottom: 20px;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }
    .grid {
      stroke: var(--border);
      stroke-dasharray: 3 3;
    }
    .cross {
      stroke: var(--border-strong);
    }
    .dot {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 2px var(--surface);
      pointer-events: none;
    }
    .y-labels span {
      position: absolute;
      left: -40px;
      width: 34px;
      text-align: right;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .x-labels {
      position: absolute;
      left: 0;
      right: 0;
      bottom: -20px;
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--muted);
    }
    .tip {
      position: absolute;
      top: 0;
      transform: translateX(12px);
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
    .tip.flip {
      transform: translateX(calc(-100% - 12px));
    }
    .tip-title {
      opacity: 0.75;
      margin-bottom: 2px;
    }
    .tip-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tip-row b {
      margin-left: auto;
      padding-left: 10px;
      font-variant-numeric: tabular-nums;
    }
    .nodata {
      height: 100%;
      display: grid;
      place-items: center;
      border: 1px dashed var(--border);
      border-radius: 12px;
    }
  `,
})
export class LineChartComponent {
  readonly series = input<LineSeries[]>([]);
  readonly label = input('Line chart');
  readonly legend = input(true);
  readonly emptyText = input('Not enough data yet');
  /** Formats an x value for the tooltip/axis. */
  readonly xFormat = input<(x: number) => string>((x) => new Date(x).toLocaleDateString());

  protected readonly W = 600;
  protected readonly H = 180;
  protected readonly hoverX = signal<number | null>(null);
  protected readonly fmt = (v: number) => fmtNumber(v);
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');

  protected readonly hasData = computed(() => this.series().some((s) => s.points.length > 0));

  private readonly bounds = computed(() => {
    const xs = this.series().flatMap((s) => s.points.map((p) => p.x));
    const ys = this.series().flatMap((s) => s.points.map((p) => p.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);
    // Follower counts live far from zero: zoom in unless values start near 0.
    const minY = rawMin > 0 && rawMin > rawMax * 0.5 ? Math.floor(rawMin * 0.98) : 0;
    const maxY = minY === 0 ? niceMax(rawMax) : Math.ceil(rawMax * 1.02) || 1;
    return { minX, maxX: maxX === minX ? minX + 1 : maxX, minY, maxY: maxY === minY ? minY + 1 : maxY };
  });

  private sx(x: number) {
    const b = this.bounds();
    return ((x - b.minX) / (b.maxX - b.minX)) * this.W;
  }
  private sy(y: number) {
    const b = this.bounds();
    return this.H - 4 - ((y - b.minY) / (b.maxY - b.minY)) * (this.H - 12);
  }

  protected readonly grid = computed(() => {
    if (!this.hasData()) return [];
    const b = this.bounds();
    return [0, 0.5, 1].map((f) => {
      const v = b.minY + (b.maxY - b.minY) * f;
      return { y: this.sy(v), label: fmtNumber(Math.round(v)) };
    });
  });

  protected readonly paths = computed(() =>
    this.series().map((s) => ({
      name: s.name,
      color: s.color,
      d: s.points
        .map((p, i) => `${i ? 'L' : 'M'}${this.sx(p.x).toFixed(1)},${this.sy(p.y).toFixed(1)}`)
        .join(' '),
    })),
  );

  protected readonly xLabels = computed(() => {
    const b = this.bounds();
    return this.hasData() ? [this.xFormat()(b.minX), this.xFormat()(b.maxX)] : ['', ''];
  });

  protected readonly hover = computed(() => {
    const hx = this.hoverX();
    if (hx === null || !this.hasData()) return null;
    const b = this.bounds();
    const xVal = b.minX + (hx / this.W) * (b.maxX - b.minX);
    // Snap to the nearest x present in any series.
    let best: number | null = null;
    for (const s of this.series())
      for (const p of s.points) if (best === null || Math.abs(p.x - xVal) < Math.abs(best - xVal)) best = p.x;
    if (best === null) return null;
    const dots = this.series()
      .map((s) => {
        const p = s.points.find((q) => q.x === best);
        return p ? { name: s.name, color: s.color, y: p.y, py: this.sy(p.y) } : null;
      })
      .filter((d): d is NonNullable<typeof d> => !!d);
    return { px: this.sx(best), label: this.xFormat()(best), dots };
  });

  protected move(e: MouseEvent) {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.hoverX.set(((e.clientX - r.left) / r.width) * this.W);
  }
}
