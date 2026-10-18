import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { NAV } from '../../app.routes';
import type { AlertMode } from '../../core/models';
import { SystemStore } from '../../core/system.store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-config',
  imports: [Icon],
  templateUrl: './config.html',
  styleUrl: './config.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigPage {
  protected readonly system = inject(SystemStore);

  protected readonly alerts: { mode: AlertMode; label: string; color: string }[] = [
    { mode: 'none', label: 'GREEN', color: 'c-teal' },
    { mode: 'yellow', label: 'YELLOW', color: 'c-gold' },
    { mode: 'red', label: 'RED', color: 'c-red' },
    { mode: 'blue', label: 'BLUE', color: 'c-blue' },
  ];
  protected readonly shortcuts = [
    ...NAV.map((n) => ({ keys: n.key, action: n.title })),
    { keys: 'CTRL K  /  /', action: 'COMMAND PALETTE' },
    { keys: 'ENTER', action: 'OPEN SELECTED ITEM' },
    { keys: 'BACKSPACE', action: 'PARENT DIRECTORY' },
    { keys: 'F11', action: 'FULLSCREEN' },
  ];

  protected readonly armed = signal<'lcars' | null>(null);
  protected readonly title = signal('INCOMING TRANSMISSION');
  protected readonly body = signal('Message from Starfleet Command.');

  constructor() {
    void this.system.refreshShellStatus();
  }

  protected async setLcarsShell() {
    if (this.armed() !== 'lcars') {
      this.armed.set('lcars');
      setTimeout(() => this.armed.set(null), 5000);
      return;
    }
    this.armed.set(null);
    await this.system.setShell('lcars');
  }

  protected broadcast() {
    if (this.title().trim()) void this.system.broadcast(this.title().trim(), this.body().trim());
  }
}
