import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';

const COLS = 14;
const ROWS = 6;
const COLORS = ['var(--lc-muted)', 'var(--frame-d)', 'var(--lc-text)', 'var(--frame-b)', 'var(--frame-a)', 'var(--lc-peri)'];

const MARKS = ['·:·', '||·|', '•••', '⁘', '×·×', '|·|', ':::', '·||', '⋮⋮', '•|•', '||||', '·•·'];

function cell(): string {
  const mark = MARKS[Math.floor(Math.random() * MARKS.length)];
  return `${mark} ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

@Component({
  selector: 'app-data-cascade',
  template: `
    @for (col of cols(); track $index) {
      <div class="col" [style.color]="colors[$index % colors.length]">
        @for (v of col; track $index) {
          <span [class.hot]="hot() === $index">{{ v }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      justify-content: flex-end;
      gap: 14px;
      overflow: hidden;
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.3;
      white-space: pre;
      opacity: 0.85;
      mask-image: linear-gradient(90deg, transparent, #000 30%);
      pointer-events: none;
    }
    .col {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-end;
      flex: none;
    }
    .hot {
      color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class DataCascade {
  protected readonly colors = COLORS;
  protected readonly cols = signal(Array.from({ length: COLS }, () => Array.from({ length: ROWS }, cell)));
  protected readonly hot = signal(0);

  constructor() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const timer = setInterval(() => {
      this.cols.update((cols) => {
        const next = cols.map((c) => [...c]);
        for (let i = 0; i < 6; i++) {
          const c = Math.floor(Math.random() * COLS);
          next[c].shift();
          next[c].push(cell());
        }
        return next;
      });
      this.hot.set(Math.floor(Math.random() * ROWS));
    }, 650);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
