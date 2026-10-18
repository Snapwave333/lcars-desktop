import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS, type IconName } from './icon-data';

@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path [attr.d]="path()" /></svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--icon-size, 1.25em);
      height: var(--icon-size, 1.25em);
      line-height: 0;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => ICONS[this.name()]);
}
