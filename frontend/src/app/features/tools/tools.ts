import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AppsStore, TOOLS } from '../../core/apps.store';
import { formatClock, splitArgs } from '../../core/format';
import type { ToolPreset } from '../../core/models';
import { Icon } from '../../shared/icon';
import type { IconName } from '../../shared/icon-data';

const TOOL_ICON: Record<string, IconName> = {
  wt: 'terminal',
  ps: 'terminal',
  cmd: 'terminal',
  task: 'monitor_heart',
  resmon: 'speed',
  settings: 'settings',
  ctrl: 'tune',
  dev: 'devices',
  disk: 'storage',
  event: 'event_note',
  serv: 'dashboard_customize',
  reg: 'developer_board',
  exp: 'folder_open',
  calc: 'calculate',
  note: 'edit_note',
  snip: 'image',
};

interface RunRecord {
  id: number;
  at: string;
  command: string;
  ok: boolean;
  message: string;
}

@Component({
  selector: 'app-tools',
  imports: [Icon],
  templateUrl: './tools.html',
  styleUrl: './tools.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsPage {
  private readonly apps = inject(AppsStore);
  private seq = 0;

  protected readonly groups = (['TERMINAL', 'MANAGEMENT', 'UTILITY'] as const).map((g) => ({
    name: g,
    tools: TOOLS.filter((t) => t.group === g),
  }));
  protected readonly icon = (t: ToolPreset): IconName => TOOL_ICON[t.id] ?? 'build';

  protected readonly path = signal('powershell.exe');
  protected readonly args = signal('');
  protected readonly running = signal(false);
  protected readonly history = signal<RunRecord[]>([]);

  protected async launch(t: ToolPreset) {
    const res = await this.apps.run(t.path, t.args ?? [], t.name);
    this.record(t.name, res);
  }

  protected async execute() {
    const path = this.path().trim();
    if (!path || this.running()) return;
    this.running.set(true);
    const args = splitArgs(this.args());
    const res = await this.apps.run(path, args, path);
    this.record([path, ...args].join(' '), res);
    this.running.set(false);
  }

  protected recall(r: RunRecord) {
    const [p, ...rest] = splitArgs(r.command);
    this.path.set(p ?? '');
    this.args.set(rest.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '));
  }

  private record(command: string, res: { ok: boolean; message: string }) {
    this.history.update((h) => [{ id: ++this.seq, at: formatClock(new Date()), command, ...res }, ...h].slice(0, 12));
  }
}
