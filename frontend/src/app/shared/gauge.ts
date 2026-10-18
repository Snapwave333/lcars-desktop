import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SEGMENTS = 30;
const SWEEP = 270;
const START = 135;
const R = 82;
const C = 100;

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function arc(a0: number, a1: number, r: number) {
  const p0 = polar(a0, r);
  const p1 = polar(a1, r);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

@Component({
  selector: 'app-gauge',
  template: `
    <svg viewBox="0 0 200 200" role="img" [attr.aria-label]="label() + ' ' + display()">
      <circle cx="100" cy="100" r="60" class="ring" />
      @for (seg of segments(); track $index) {
        <path [attr.d]="seg.d" class="seg" [class.on]="seg.on" [class.hot]="seg.hot" />
      }
      @for (t of ticks; track $index) {
        <line [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" class="tick" />
      }
      <text x="100" y="104" class="value">{{ display() }}</text>
      <text x="100" y="128" class="unit">{{ unit() }}</text>
      <text x="100" y="186" class="label">{{ label() }}</text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
      color: var(--c, var(--lc-orange));
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .ring {
      fill: none;
      stroke: color-mix(in srgb, currentColor 30%, transparent);
      stroke-width: 1.5;
      stroke-dasharray: 3 5;
    }
    .seg {
      fill: none;
      stroke: color-mix(in srgb, currentColor 16%, #000);
      stroke-width: 16;
      transition: stroke 0.4s ease;
    }
    .seg.on {
      stroke: currentColor;
    }
    .seg.hot {
      stroke: var(--lc-red);
    }
    .tick {
      stroke: var(--lc-muted);
      stroke-width: 2;
    }
    text {
      text-anchor: middle;
      font-family: var(--font);
      font-variant-numeric: tabular-nums;
    }
    .value {
      fill: var(--lc-text);
      font-size: 38px;
      font-weight: 600;
    }
    .unit {
      fill: currentColor;
      font-size: 12px;
      letter-spacing: 0.18em;
    }
    .label {
      fill: currentColor;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.22em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gauge {
  readonly value = input(0);
  readonly label = input('');
  readonly unit = input('PERCENT');
  readonly warnAt = input(90);

  protected readonly display = computed(() => `${Math.round(this.value())}`);

  protected readonly ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = START + SWEEP * f;
    const p0 = polar(a, R + 12);
    const p1 = polar(a, R + 18);
    return { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y };
  });

  private readonly paths = Array.from({ length: SEGMENTS }, (_, i) => {
    const step = SWEEP / SEGMENTS;
    return arc(START + i * step + 1.2, START + (i + 1) * step - 1.2, R);
  });

  protected readonly segments = computed(() => {
    const v = Math.max(0, Math.min(100, this.value()));
    const lit = Math.round((v / 100) * SEGMENTS);
    const warn = (this.warnAt() / 100) * SEGMENTS;
    return this.paths.map((d, i) => ({ d, on: i < lit, hot: i < lit && i >= warn }));
  });
}
