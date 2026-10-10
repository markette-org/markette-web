import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatHour, weekdayNames } from '../utils/dates';

/** 7×24 best-time heatmap: rows Monday→Sunday, columns 0→23 (workspace-local hours). */
@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [class.compact]="compact()">
      <div class="grid" role="grid" [attr.aria-label]="label()" (mouseleave)="hover.set(null)">
        <div class="corner"></div>
        @for (h of hours; track h) {
          <div class="hour" [class.major]="h % 3 === 0">{{ h % 3 === 0 ? hourLabel(h) : '' }}</div>
        }
        @for (row of cells(); track $index; let d = $index) {
          <div class="day">{{ days[d] }}</div>
          @for (c of row; track c.hour) {
            <div
              class="cell"
              role="gridcell"
              [class.top]="c.top"
              [style.background]="c.bg"
              [attr.aria-label]="days[d] + ' ' + hourLabel(c.hour) + ': score ' + c.score + (c.count !== null ? ', ' + c.count + ' posts' : '')"
              (mouseenter)="hover.set({ d: d, h: c.hour, score: c.score, count: c.count })"
            ></div>
          }
        }
      </div>
      <div class="foot">
        <div class="legend">
          <span>Low</span>
          <span class="ramp"></span>
          <span>High</span>
          @if (hasTop()) {
            <span class="top-key"><span class="sq"></span>Top slots</span>
          }
        </div>
        <div class="readout tabular" aria-live="polite">
          @if (hover(); as h) {
            <strong>{{ longDays[h.d] }} {{ hourLabel(h.h) }}</strong> · score {{ h.score }}
            @if (h.count !== null) {
              · {{ h.count }} {{ h.count === 1 ? 'post' : 'posts' }}
            }
          } @else {
            <span class="muted">Hover a cell for details</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .wrap {
      overflow-x: auto;
    }
    .grid {
      display: grid;
      grid-template-columns: 38px repeat(24, minmax(14px, 1fr));
      gap: 3px;
      min-width: 480px;
    }
    .compact .grid {
      gap: 2px;
      grid-template-columns: 30px repeat(24, minmax(9px, 1fr));
      min-width: 300px;
    }
    .hour {
      font-size: 0.66rem;
      color: var(--muted);
      text-align: left;
      white-space: nowrap;
      overflow: visible;
      height: 16px;
    }
    .day {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-2);
      display: flex;
      align-items: center;
    }
    .cell {
      aspect-ratio: 1 / 1;
      border-radius: 4px;
      min-height: 12px;
      transition: transform 0.1s;
      position: relative;
    }
    .compact .cell {
      border-radius: 3px;
      min-height: 9px;
    }
    .cell:hover {
      transform: scale(1.18);
      z-index: 1;
      box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--text);
    }
    .cell.top::after {
      content: '';
      position: absolute;
      inset: 30%;
      border-radius: 50%;
      background: var(--coral);
      box-shadow: 0 0 0 1.5px var(--surface);
    }
    .foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
      font-size: 0.78rem;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
    }
    .ramp {
      width: 110px;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--heat-0), rgb(var(--heat-hi)));
    }
    .top-key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
    }
    .sq {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--coral);
    }
    .readout {
      color: var(--text-2);
    }
  `,
})
export class HeatmapComponent {
  readonly scores = input<number[][]>([]);
  readonly counts = input<number[][] | null>(null);
  readonly top = input<{ weekday: number; hour: number }[]>([]);
  readonly compact = input(false);
  readonly label = input('Best times heatmap');

  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);
  protected readonly days = weekdayNames('short');
  protected readonly longDays = weekdayNames('long');
  protected readonly hover = signal<{ d: number; h: number; score: number; count: number | null } | null>(null);
  protected readonly hasTop = computed(() => this.top().length > 0);

  protected hourLabel(h: number) {
    return formatHour(h);
  }

  protected readonly cells = computed(() => {
    const s = this.scores();
    const counts = this.counts();
    const top = new Set(this.top().map((t) => `${t.weekday}:${t.hour}`));
    return Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => {
        const score = Math.round(s[d]?.[h] ?? 0);
        const a = Math.max(0, Math.min(100, score)) / 100;
        return {
          hour: h,
          score,
          count: counts ? (counts[d]?.[h] ?? 0) : null,
          top: top.has(`${d}:${h}`),
          bg: a < 0.04 ? 'var(--heat-0)' : `rgba(var(--heat-hi), ${(0.08 + a * 0.92).toFixed(3)})`,
        };
      }),
    );
  });
}
