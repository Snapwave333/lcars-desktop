import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SystemStore } from '../core/system.store';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    @for (t of system.toasts(); track t.id) {
      <div class="toast" [attr.data-tone]="t.tone" role="status">
        <span class="cap"><app-icon [name]="t.tone === 'alert' ? 'campaign' : t.tone === 'success' ? 'task_alt' : 'info'" /></span>
        <div class="text">
          <b>{{ t.title }}</b>
          @if (t.body) {
            <span>{{ t.body }}</span>
          }
        </div>
        <button type="button" class="x" (click)="system.dismissToast(t.id)" aria-label="Dismiss"><app-icon name="close" /></button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 50;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      width: min(420px, calc(100vw - 40px));
    }
    .toast {
      --t: var(--lc-teal);
      display: flex;
      align-items: stretch;
      gap: 12px;
      background: var(--lc-panel);
      border-radius: 999px 4px 4px 999px;
      box-shadow: inset 0 0 0 2px var(--t), 0 10px 30px rgba(0, 0, 0, 0.7);
      overflow: hidden;
      animation: lcars-rise 0.22s ease both;
    }
    .toast[data-tone='alert'] { --t: var(--lc-orange); }
    .toast[data-tone='success'] { --t: var(--lc-green); }
    .cap {
      display: grid;
      place-items: center;
      width: 52px;
      background: var(--t);
      color: var(--lc-ink);
      --icon-size: 24px;
    }
    .text {
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1;
      min-width: 0;
      padding: 10px 0;
      gap: 2px;
    }
    b {
      color: var(--t);
      font-family: var(--display);
      font-weight: 400;
      font-size: 16px;
      letter-spacing: 0.14em;
    }
    .text span {
      color: var(--lc-text);
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .x {
      align-self: center;
      margin-right: 10px;
      border: 0;
      background: transparent;
      color: var(--lc-muted);
      cursor: pointer;
      --icon-size: 20px;
    }
    .x:hover { color: #fff; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  protected readonly system = inject(SystemStore);
}
