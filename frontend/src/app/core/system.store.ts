import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { BACKEND } from './backend';
import { LogStore } from './log.store';
import type { AlertMode, NotifyPayload, QuickLocation, ShellStatus, Telemetry, WindowAction } from './models';

export interface Toast extends NotifyPayload {
  id: number;
  tone: 'info' | 'success' | 'alert';
}

const HISTORY = 90;
const POLL_MS = 2000;

const EMPTY: Telemetry = {
  hostname: '—',
  username: '—',
  os: '—',
  arch: '—',
  cpu_cores: 0,
  cpu_load_percent: 0,
  total_memory_mb: 0,
  available_memory_mb: 0,
  memory_load_percent: 0,
  disk_total_gb: 0,
  disk_free_gb: 0,
  uptime_seconds: 0,
  wallpaper_path: '',
  app_version: '',
};

export function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

@Injectable({ providedIn: 'root' })
export class SystemStore {
  private readonly backend = inject(BACKEND);
  private readonly log = inject(LogStore);
  private toastSeq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly live = this.backend.live;
  readonly telemetry = signal<Telemetry>(EMPTY);
  readonly online = signal(false);
  readonly cpuHistory = signal<number[]>([]);
  readonly memHistory = signal<number[]>([]);
  readonly alert = signal<AlertMode>('none');
  readonly toasts = signal<Toast[]>([]);
  readonly shellStatus = signal<ShellStatus>({ autostart_enabled: false, lcars_shell_active: false, current_shell: '' });
  readonly quickLocations = signal<QuickLocation[]>([]);
  readonly diskUsedPercent = computed(() => {
    const t = this.telemetry();
    return t.disk_total_gb > 0 ? Math.round(((t.disk_total_gb - t.disk_free_gb) / t.disk_total_gb) * 100) : 0;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.backend
      .subscribe({
        alert: (mode) => this.applyAlert(mode),
        notify: (p) => this.pushToast(p, 'alert'),
        wallpaper: (path) => this.telemetry.update((t) => ({ ...t, wallpaper_path: path })),
        reload: () => location.reload(),
      })
      .then((off) => destroyRef.onDestroy(off))
      .catch((err) => this.log.add('SYSTEM', 'Event bridge unavailable', 'warn', errorText(err)));

    this.log.add('SYSTEM', this.live ? 'LCARS shell online' : 'LCARS shell online — demo data (no Tauri runtime)', 'success');
    void this.poll();
    void this.refreshShellStatus();
    void this.backend.quickLocations().then((l) => this.quickLocations.set(l)).catch(() => undefined);
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.poll();
    }, POLL_MS);
    destroyRef.onDestroy(() => this.timer && clearInterval(this.timer));
  }

  private async poll() {
    try {
      const t = await this.backend.telemetry();
      this.telemetry.set(t);
      this.online.set(true);
      const push = (list: number[], v: number) => [...list, v].slice(-HISTORY);
      this.cpuHistory.update((h) => push(h, t.cpu_load_percent));
      this.memHistory.update((h) => push(h, t.memory_load_percent));
    } catch (err) {
      if (this.online()) this.log.add('SYSTEM', 'Telemetry link lost', 'alert', errorText(err));
      this.online.set(false);
    }
  }

  private applyAlert(mode: AlertMode) {
    if (mode === this.alert()) return;
    this.alert.set(mode);
    const level = mode === 'none' ? 'success' : mode === 'red' ? 'alert' : 'warn';
    this.log.add('ALERTS', mode === 'none' ? 'Alert condition cleared' : `${mode.toUpperCase()} ALERT declared`, level);
  }

  async setAlert(mode: AlertMode) {
    this.applyAlert(mode);
    try {
      await this.backend.setAlert(mode);
    } catch (err) {
      this.log.add('ALERTS', 'Failed to broadcast alert', 'warn', errorText(err));
    }
  }

  cycleAlert() {
    const order: AlertMode[] = ['none', 'yellow', 'red'];
    const next = order[(order.indexOf(this.alert()) + 1) % order.length];
    void this.setAlert(next);
  }

  pushToast(p: NotifyPayload, tone: Toast['tone'] = 'info', ttl = 6000) {
    const toast: Toast = { ...p, id: ++this.toastSeq, tone };
    this.toasts.update((list) => [toast, ...list].slice(0, 4));
    if (tone === 'alert') {
      this.log.add('SYSTEM', `Transmission: ${p.title}`, 'info', p.body || undefined);
    }
    setTimeout(() => this.dismissToast(toast.id), ttl);
  }

  dismissToast(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  async broadcast(title: string, body: string) {
    try {
      await this.backend.notify(title, body);
    } catch (err) {
      this.log.add('SYSTEM', 'Notification failed', 'alert', errorText(err));
    }
  }

  async windowAction(action: WindowAction) {
    try {
      await this.backend.windowAction(action);
    } catch (err) {
      this.log.add('SYSTEM', `Window ${action} failed`, 'warn', errorText(err));
    }
  }

  async refreshShellStatus() {
    try {
      this.shellStatus.set(await this.backend.shellStatus());
    } catch {
      return;
    }
  }

  async setAutoStart(enable: boolean) {
    try {
      await this.backend.setAutoStart(enable);
      this.log.add('CONFIG', `Auto-start ${enable ? 'enabled' : 'disabled'}`, 'success');
      this.pushToast({ title: 'SETTINGS UPDATED', body: `Auto-start ${enable ? 'enabled' : 'disabled'}` }, 'success', 3000);
    } catch (err) {
      this.log.add('CONFIG', 'Auto-start change failed', 'alert', errorText(err));
    }
    await this.refreshShellStatus();
  }

  async setShell(target: 'lcars' | 'explorer') {
    try {
      await this.backend.setShell(target);
      this.log.add('CONFIG', `Login shell set to ${target.toUpperCase()} (takes effect next sign-in)`, 'warn');
      this.pushToast({ title: 'LOGIN SHELL CHANGED', body: `Next sign-in will load ${target.toUpperCase()}` }, 'success', 4000);
    } catch (err) {
      this.log.add('CONFIG', `Shell change to ${target} failed`, 'alert', errorText(err));
    }
    await this.refreshShellStatus();
  }
}
