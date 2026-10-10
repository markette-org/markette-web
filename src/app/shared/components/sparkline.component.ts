import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let seq = 0;

/** Tiny trend line with a soft area fill. Purely decorative: pair it with a number. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" preserveAspectRatio="none" [attr.height]="height()" role="img" [attr.aria-label]="label()">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0.28" />
          <stop offset="100%" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>
      @if (paths(); as p) {
        <path [attr.d]="p.area" [attr.fill]="'url(#' + gid + ')'" />
        <path [attr.d]="p.line" fill="none" [attr.stroke]="color()" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        <circle [attr.cx]="p.lastX" [attr.cy]="p.lastY" r="3" [attr.fill]="color()" stroke="var(--surface)" stroke-width="2" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    svg {
      width: 100%;
      display: block;
      overflow: visible;
    }
  `,
})
export class SparklineComponent {
  readonly values = input<number[]>([]);
  readonly color = input('var(--accent)');
  readonly height = input(40);
  readonly label = input('Trend');
  protected readonly width = computed(() => 200);
  protected readonly gid = `spark-${++seq}`;

  protected readonly paths = computed(() => {
    const v = this.values();
    if (v.length < 2) return null;
    const w = this.width();
    const h = this.height();
    const max = Math.max(...v, 1);
    const min = Math.min(...v, 0);
    const span = max - min || 1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 3 - ((y - min) / span) * (h - 6)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    const [lastX, lastY] = pts[pts.length - 1];
    return { line, area, lastX, lastY };
  });
}
