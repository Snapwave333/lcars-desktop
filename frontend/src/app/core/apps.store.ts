import { Injectable, computed, inject, signal } from '@angular/core';
import { BACKEND } from './backend';
import { LogStore } from './log.store';
import type { IconName } from '../shared/icon-data';
import type { InstalledApp, ToolPreset } from './models';
import { errorText } from './system.store';

export const CATEGORY_ICON: Record<string, IconName> = {
  ALL: 'apps',
  DEVELOPMENT: 'code',
  GAMES: 'sports_esports',
  'INTERNET & COMMS': 'chat',
  'MEDIA & GRAPHICS': 'movie',
  OFFICE: 'work',
  'SYSTEM & ADMIN': 'settings',
  'UTILITY & TOOLS': 'handyman',
};

export const TOOLS: ToolPreset[] = [
  { id: 'wt', name: 'WINDOWS TERMINAL', group: 'TERMINAL', code: 'CMD-01', path: 'wt.exe', color: 'c-orange', description: 'Modern tabbed terminal' },
  { id: 'ps', name: 'POWERSHELL', group: 'TERMINAL', code: 'CMD-02', path: 'powershell.exe', color: 'c-peri', description: 'Windows PowerShell session' },
  { id: 'cmd', name: 'COMMAND PROMPT', group: 'TERMINAL', code: 'CMD-03', path: 'cmd.exe', color: 'c-sky', description: 'Classic command interpreter' },
  { id: 'task', name: 'TASK MANAGER', group: 'MANAGEMENT', code: 'SYS-01', path: 'taskmgr.exe', color: 'c-gold', description: 'Processes, performance, startup' },
  { id: 'resmon', name: 'RESOURCE MONITOR', group: 'MANAGEMENT', code: 'SYS-02', path: 'resmon.exe', color: 'c-teal', description: 'Deep CPU, memory, disk, network' },
  { id: 'settings', name: 'SYSTEM SETTINGS', group: 'MANAGEMENT', code: 'SYS-03', path: 'ms-settings:', color: 'c-lavender', description: 'Windows Settings app' },
  { id: 'ctrl', name: 'CONTROL PANEL', group: 'MANAGEMENT', code: 'SYS-04', path: 'control.exe', color: 'c-peach', description: 'Classic control panel applets' },
  { id: 'dev', name: 'DEVICE MANAGER', group: 'MANAGEMENT', code: 'SYS-05', path: 'devmgmt.msc', color: 'c-orange', description: 'Hardware devices and drivers' },
  { id: 'disk', name: 'DISK MANAGEMENT', group: 'MANAGEMENT', code: 'SYS-06', path: 'diskmgmt.msc', color: 'c-gold', description: 'Partitions and volumes' },
  { id: 'event', name: 'EVENT VIEWER', group: 'MANAGEMENT', code: 'SYS-07', path: 'eventvwr.msc', color: 'c-peri', description: 'Diagnostics and event logs' },
  { id: 'serv', name: 'SERVICES', group: 'MANAGEMENT', code: 'SYS-08', path: 'services.msc', color: 'c-sky', description: 'Background services' },
  { id: 'reg', name: 'REGISTRY EDITOR', group: 'MANAGEMENT', code: 'SYS-09', path: 'regedit.exe', color: 'c-red', description: 'Raw registry configuration' },
  { id: 'exp', name: 'FILE EXPLORER', group: 'UTILITY', code: 'UTL-01', path: 'explorer.exe', color: 'c-gold', description: 'Native Windows file browser' },
  { id: 'calc', name: 'CALCULATOR', group: 'UTILITY', code: 'UTL-02', path: 'calc.exe', color: 'c-peach', description: 'Standard calculator' },
  { id: 'note', name: 'NOTEPAD', group: 'UTILITY', code: 'UTL-03', path: 'notepad.exe', color: 'c-lavender', description: 'Plain text editor' },
  { id: 'snip', name: 'SNIPPING TOOL', group: 'UTILITY', code: 'UTL-04', path: 'ms-screenclip:', color: 'c-teal', description: 'Capture a screen region' },
];

@Injectable({ providedIn: 'root' })
export class AppsStore {
  private readonly backend = inject(BACKEND);
  private readonly log = inject(LogStore);
  private requested = false;

  readonly apps = signal<InstalledApp[]>([]);
  readonly loading = signal(false);
  readonly query = signal('');
  readonly category = signal('ALL');
  readonly recent = signal<string[]>([]);

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const a of this.apps()) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return [{ name: 'ALL', count: this.apps().length }, ...[...counts].sort().map(([name, count]) => ({ name, count }))];
  });

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return this.apps().filter(
      (a) => (cat === 'ALL' || a.category === cat) && (!q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)),
    );
  });

  ensureLoaded() {
    if (!this.requested) {
      this.requested = true;
      void this.load(false);
    }
  }

  async load(rescan: boolean) {
    this.loading.set(true);
    try {
      const apps = await this.backend.installedApps(rescan);
      this.apps.set(apps);
      if (rescan) this.log.add('APPLICATIONS', `Catalog rescanned: ${apps.length} applications`, 'success');
    } catch (err) {
      this.log.add('APPLICATIONS', 'Application scan failed', 'alert', errorText(err));
    } finally {
      this.loading.set(false);
    }
  }

  async launchApp(app: InstalledApp) {
    try {
      await this.backend.open(app.path);
      this.recent.update((r) => [app.id, ...r.filter((id) => id !== app.id)].slice(0, 6));
      this.log.add('APPLICATIONS', `Launched ${app.name}`, 'success');
    } catch (err) {
      this.log.add('APPLICATIONS', `Cannot launch ${app.name}`, 'alert', errorText(err));
    }
  }

  async run(path: string, args: string[] = [], label = path): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.backend.launch(path, args);
      const message = res.pid ? `${label} started — PID ${res.pid}` : `${label} started`;
      this.log.add('APPLICATIONS', message, 'success', args.length ? args.join(' ') : undefined);
      return { ok: true, message };
    } catch (err) {
      const message = errorText(err);
      this.log.add('APPLICATIONS', `Cannot run ${label}`, 'alert', message);
      return { ok: false, message };
    }
  }
}
