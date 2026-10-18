import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from './icon';
import type { IconName } from './icon-data';

const STONES = 14;

@Component({
  selector: 'app-totem',
  imports: [Icon],
  template: `
    <div class="pillar" role="img" [attr.aria-label]="label() + ' ' + rounded() + ' percent'">
      <div class="cap" [class.on]="full()"></div>
      @for (s of stones(); track $index) {
        <div class="stone" [class.on]="s.on" [class.hot]="s.hot"></div>
      }
      <div class="base"></div>
    </div>
    <div class="read">
      <span class="value">{{ rounded() }}</span>
      <span class="unit">PERCENT</span>
      <span class="label"><app-icon [name]="icon()" /> {{ label() }}</span>
      <span class="sub">{{ sub() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      gap: 16px;
      min-height: 0;
      color: var(--c, var(--lc-orange));
    }
    .pillar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 88px;
      flex: none;
    }
    .cap {
      height: 24px;
      background: var(--lc-plate);
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      transition: background-color 0.4s ease;
    }
    .cap.on {
      background: currentColor;
    }
    .stone {
      flex: 1;
      min-height: 8px;
      background: #21180f;
      clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
      transition: background-color 0.4s ease;
    }
    .stone.on {
      background: currentColor;
    }
    .stone.hot {
      background: var(--lc-red);
    }
    .base {
      height: 14px;
      border-radius: 0 0 44px 44px;
      background: var(--lc-plate);
    }
    .read {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 4px;
      min-width: 0;
    }
    .value {
      color: var(--lc-text);
      font-family: var(--display);
      font-size: 58px;
      line-height: 0.9;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: 12px;
      letter-spacing: 0.24em;
    }
    .label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.2em;
      --icon-size: 22px;
    }
    .sub {
      color: var(--lc-muted);
      font-size: 13px;
      letter-spacing: 0.1em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Totem {
  readonly value = input(0);
  readonly label = input('');
  readonly sub = input('');
  readonly icon = input<IconName>('speed');
  readonly warnAt = input(90);

  protected readonly rounded = computed(() => Math.round(Math.max(0, Math.min(100, this.value()))));
  protected readonly full = computed(() => this.rounded() >= 100);
  protected readonly stones = computed(() => {
    const lit = Math.round((this.rounded() / 100) * STONES);
    const warn = Math.round((this.warnAt() / 100) * STONES);
    return Array.from({ length: STONES }, (_, i) => {
      const level = STONES - 1 - i;
      return { on: level < lit, hot: level < lit && level >= warn };
    });
  });
}
