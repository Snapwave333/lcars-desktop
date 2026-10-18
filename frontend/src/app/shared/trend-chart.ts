import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Series {
  label: string;
  color: string;
  values: number[];
}

const W = 600;
const H = 200;

@Component({
  selector: 'app-trend-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="none" role="img" aria-label="Load history">
      @for (g of grid; track g) {
        <line x1="0" [attr.y1]="g" [attr.x2]="w" [attr.y2]="g" class="grid" />
      }
      @for (s of paths(); track s.label) {
        <path [attr.d]="s.area" class="area" [style.fill]="s.color" />
        <path [attr.d]="s.line" class="line" [style.stroke]="s.color" />
      }
    </svg>
    <div class="axis num"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
    <div class="legend">
      @for (s of paths(); track s.label) {
        <span [style.--c]="s.color"><i></i>{{ s.label }} <b class="num">{{ s.last }}%</b></span>
      }
      <span class="span num">{{ window() }}</span>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
    }
    svg {
      flex: 1;
      width: 100%;
      min-height: 120px;
      padding-left: 34px;
    }
    .grid {
      stroke: var(--lc-plate);
      stroke-width: 1.5;
      stroke-dasharray: 2 6;
      vector-effect: non-scaling-stroke;
    }
    .line {
      fill: none;
      stroke-width: 2.5;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .area {
      opacity: 0.12;
    }
    .axis {
      position: absolute;
      top: 0;
      bottom: 30px;
      left: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: var(--lc-muted);
      font-size: 11px;
      line-height: 0;
      padding: 0;
    }
    .legend {
      display: flex;
      gap: 20px;
      padding-left: 34px;
      font-size: 13px;
      letter-spacing: 0.14em;
      color: var(--c, var(--lc-text));
    }
    .legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend i {
      width: 22px;
      height: 8px;
      border-radius: 4px;
      background: var(--c);
    }
    .legend b {
      color: var(--lc-text);
      font-weight: 600;
    }
    .legend .span {
      margin-left: auto;
      color: var(--lc-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrendChart {
  readonly series = input<Series[]>([]);
  readonly capacity = input(90);
  readonly intervalSec = input(2);

  protected readonly w = W;
  protected readonly h = H;
  protected readonly grid = [0, 0.25, 0.5, 0.75, 1].map((f) => f * H);

  protected readonly window = computed(() => `LAST ${Math.round((this.capacity() * this.intervalSec()) / 60)} MIN`);

  protected readonly paths = computed(() =>
    this.series().map((s) => {
      const cap = this.capacity();
      const step = W / Math.max(1, cap - 1);
      const pts = s.values.map((v, i) => [i * step, H - (Math.max(0, Math.min(100, v)) / 100) * H] as const);
      const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z` : '';
      return { label: s.label, color: s.color, line, area, last: Math.round(s.values[s.values.length - 1] ?? 0) };
    }),
  );
}
