import { Injectable, NgZone, OnDestroy, signal } from '@angular/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export type AlertMode = 'red' | 'yellow' | 'blue' | 'none';

export interface NotifyPayload {
  title: string;
  body: string;
  timestamp?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: 'APPLICATIONS' | 'FILESYSTEM' | 'SYSTEM' | 'ALERTS' | 'CONFIG';
  message: string;
  detail?: string;
  level: 'info' | 'warn' | 'alert' | 'success';
}

export interface DesktopItem {
  name: string;
  filename: string;
  path: string;
  item_type: 'folder' | 'shortcut' | 'script' | 'executable' | 'image' | 'document' | 'file';
  extension: string;
  size_bytes: number;
  modified_epoch: number;
}

export interface InstalledApp {
  id: string;
  name: string;
  path: string;
  category: string;
  code: string;
  color: string;
}

export interface QuickLocation {
  id: string;
  name: string;
  path: string;
}

export interface SystemTelemetry {
  hostname: string;
  username: string;
  os: string;
  arch: string;
  cpu_cores: number;
  total_memory_mb: number;
  available_memory_mb: number;
  memory_load_percent: number;
  uptime_seconds: number;
  wallpaper_path?: string;
  app_version: string;
}

export interface ShellStatus {
  autostart_enabled: boolean;
  lcars_shell_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class CliBridgeService implements OnDestroy {
  readonly alertMode = signal<AlertMode>('none');
  readonly wallpaperPath = signal<string>('');
  readonly notice = signal<NotifyPayload | null>(null);
  readonly commsLog = signal<ActivityLogEntry[]>([]);
  readonly currentDirectory = signal<string>('');
  readonly quickLocations = signal<QuickLocation[]>([
    { id: 'desktop', name: 'DESKTOP', path: '' },
    { id: 'downloads', name: 'DOWNLOADS', path: '' },
    { id: 'documents', name: 'DOCUMENTS', path: '' },
    { id: 'pictures', name: 'PICTURES', path: '' },
    { id: 'userhome', name: 'USER PROFILE', path: '' },
    { id: 'rootdrive', name: 'SYSTEM DRIVE (C:)', path: 'C:\\' },
  ]);
  readonly shellStatus = signal<ShellStatus>({
    autostart_enabled: false,
    lcars_shell_active: false,
  });

  readonly installedApps = signal<InstalledApp[]>([]);
  readonly desktopItems = signal<DesktopItem[]>([]);

  readonly telemetry = signal<SystemTelemetry>({
    hostname: 'WINDOWS-HOST',
    username: 'USER',
    os: 'Windows 11 x64',
    arch: 'x86_64',
    cpu_cores: 16,
    total_memory_mb: 32768,
    available_memory_mb: 21500,
    memory_load_percent: 34,
    uptime_seconds: 147298,
    wallpaper_path: '',
    app_version: '0.1.0',
  });

  private unlisten: UnlistenFn[] = [];
  private telemetryTimer: number | null = null;

  constructor(private readonly zone: NgZone) {
    this.addLog('SYSTEM', 'LCARS Windows Desktop Shell initialized', 'Active & Ready', 'info');
    void this.bindEvents();
    void this.refreshTelemetry();
    void this.fetchDesktopItems();
    void this.fetchQuickLocations();
    void this.fetchInstalledApps();
    void this.fetchShellStatus();
    this.telemetryTimer = window.setInterval(() => void this.refreshTelemetry(), 3000);
  }

  private async bindEvents() {
    try {
      const unsubs: UnlistenFn[] = [
        await listen<AlertMode>('lcars://alert', (event) => {
          this.zone.run(() => {
            this.alertMode.set(event.payload);
            this.addLog(
              'ALERTS',
              `Alert condition changed: ${event.payload.toUpperCase()}`,
              undefined,
              event.payload === 'none' ? 'success' : event.payload === 'red' ? 'alert' : 'warn'
            );
          });
        }),
        await listen<string>('lcars://wallpaper', (event) => {
          this.zone.run(() => {
            this.wallpaperPath.set(event.payload);
            this.addLog('SYSTEM', 'Desktop wallpaper updated', event.payload, 'info');
          });
        }),
        await listen<NotifyPayload>('lcars://notify', (event) => {
          this.zone.run(() => {
            const payload = {
              ...event.payload,
              timestamp: new Date().toLocaleTimeString(),
            };
            this.notice.set(payload);
            this.addLog('SYSTEM', `Notification: ${payload.title}`, payload.body, 'alert');
          });
        }),
        await listen('lcars://reload', () => {
          this.zone.run(() => {
            this.addLog('SYSTEM', 'Interface reload requested', undefined, 'warn');
            window.location.reload();
          });
        }),
      ];
      this.unlisten.push(...unsubs);
    } catch {
      // In web development or test environment, Tauri event system may not be bound
    }
  }

  async setAlert(mode: AlertMode): Promise<boolean> {
    this.alertMode.set(mode);
    this.addLog(
      'ALERTS',
      `Alert mode set: ${mode.toUpperCase()}`,
      undefined,
      mode === 'none' ? 'success' : mode === 'red' ? 'alert' : 'warn'
    );
    try {
      await invoke('alert', { mode });
      return true;
    } catch {
      return false;
    }
  }

  async fetchDesktopItems(): Promise<DesktopItem[]> {
    return this.listDirectory('');
  }

  async listDirectory(path: string = ''): Promise<DesktopItem[]> {
    try {
      const items = await invoke<DesktopItem[]>('list_directory', { path: path.trim() || null });
      if (Array.isArray(items)) {
        this.zone.run(() => {
          this.desktopItems.set(items);
          this.currentDirectory.set(path);
        });
        const label = path ? `Folder: ${path}` : 'Desktop';
        this.addLog('FILESYSTEM', `Loaded ${items.length} items from ${label}`, undefined, 'success');
        return items;
      }
    } catch (err) {
      this.addLog('FILESYSTEM', `Failed to read directory: ${path}`, String(err), 'alert');
    }
    return [];
  }

  async fetchQuickLocations(): Promise<QuickLocation[]> {
    try {
      const locs = await invoke<QuickLocation[]>('get_quick_locations');
      if (Array.isArray(locs) && locs.length > 0) {
        this.zone.run(() => {
          this.quickLocations.set(locs);
        });
        return locs;
      }
    } catch {}
    return this.quickLocations();
  }

  async fetchInstalledApps(): Promise<InstalledApp[]> {
    try {
      const apps = await invoke<InstalledApp[]>('get_installed_apps');
      if (Array.isArray(apps)) {
        this.zone.run(() => {
          this.installedApps.set(apps);
        });
        this.addLog('APPLICATIONS', `Cataloged ${apps.length} installed Windows applications`, undefined, 'success');
        return apps;
      }
    } catch (err) {
      this.addLog('APPLICATIONS', 'Failed to scan installed applications', String(err), 'alert');
    }
    return [];
  }

  async fetchShellStatus(): Promise<ShellStatus> {
    try {
      const status = await invoke<ShellStatus>('get_shell_status');
      if (status) {
        this.zone.run(() => {
          this.shellStatus.set(status);
        });
        return status;
      }
    } catch {}
    return this.shellStatus();
  }

  async setAutoStart(enable: boolean): Promise<boolean> {
    try {
      await invoke('set_auto_start', { enable });
      await this.fetchShellStatus();
      this.addLog('CONFIG', `Windows auto-start on boot: ${enable ? 'ENABLED' : 'DISABLED'}`, undefined, 'success');
      return true;
    } catch (err) {
      this.addLog('CONFIG', 'Failed to configure auto-start', String(err), 'alert');
      return false;
    }
  }

  async setWindowsShell(target: 'lcars' | 'explorer'): Promise<boolean> {
    try {
      await invoke('set_windows_shell', { target });
      await this.fetchShellStatus();
      this.addLog('CONFIG', `Default Windows Shell set to: ${target.toUpperCase()}`, undefined, 'warn');
      return true;
    } catch (err) {
      this.addLog('CONFIG', `Failed to set Windows shell to ${target}`, String(err), 'alert');
      return false;
    }
  }

  async openItem(path: string): Promise<boolean> {
    try {
      await invoke('open_item', { path });
      this.addLog('FILESYSTEM', `Executed / Opened item: ${path}`, undefined, 'success');
      return true;
    } catch (err) {
      this.addLog('FILESYSTEM', `Failed to open item: ${path}`, String(err), 'alert');
      return false;
    }
  }

  async revealItem(path: string): Promise<boolean> {
    try {
      await invoke('reveal_item', { path });
      this.addLog('FILESYSTEM', `Revealed item in Windows Explorer: ${path}`, undefined, 'info');
      return true;
    } catch (err) {
      this.addLog('FILESYSTEM', `Failed to reveal item: ${path}`, String(err), 'alert');
      return false;
    }
  }

  async sendNotification(title: string, body: string = ''): Promise<boolean> {
    try {
      await invoke('send_notification', { title, body });
      return true;
    } catch {
      this.notice.set({ title, body, timestamp: new Date().toLocaleTimeString() });
      this.addLog('SYSTEM', `Notification broadcast: ${title}`, body, 'info');
      return true;
    }
  }

  async launchApp(path: string, args: string[] = [], detached: boolean = true): Promise<{ pid?: number; ok: boolean; error?: string }> {
    try {
      const res = await invoke<{ pid?: number }>('launch_app', { path, args, detached });
      this.addLog('APPLICATIONS', `Launched process: ${path}`, `PID: ${res.pid ?? 'N/A'}`, 'success');
      return { ok: true, pid: res.pid };
    } catch (err) {
      const errorStr = String(err);
      this.addLog('APPLICATIONS', `Failed to launch process: ${path}`, errorStr, 'alert');
      return { ok: false, error: errorStr };
    }
  }

  async captureScreenshot(path: string): Promise<boolean> {
    try {
      await invoke('screenshot', { path });
      this.addLog('SYSTEM', `Screenshot captured and saved: ${path}`, undefined, 'success');
      return true;
    } catch (err) {
      this.addLog('SYSTEM', `Screenshot capture error`, String(err), 'alert');
      return false;
    }
  }

  async refreshTelemetry(): Promise<void> {
    try {
      const info = await invoke<SystemTelemetry>('get_system_info');
      if (info && info.hostname) {
        this.zone.run(() => {
          this.telemetry.set(info);
          if (info.wallpaper_path && !this.wallpaperPath()) {
            this.wallpaperPath.set(info.wallpaper_path);
          }
        });
      }
    } catch {
      // Fallback
      const cur = this.telemetry();
      this.telemetry.set({
        ...cur,
        uptime_seconds: cur.uptime_seconds + 3,
      });
    }
  }

  async toggleWindow(): Promise<void> {
    try {
      await invoke('toggle_window');
    } catch {}
  }

  async minimizeWindow(): Promise<void> {
    try {
      await invoke('minimize_window');
    } catch {}
  }

  async maximizeWindow(): Promise<void> {
    try {
      await invoke('maximize_window');
    } catch {}
  }

  async toggleFullscreen(): Promise<void> {
    try {
      await invoke('toggle_fullscreen');
    } catch {}
  }

  async closeWindow(): Promise<void> {
    try {
      await invoke('close_window');
    } catch {}
  }

  clearNotice() {
    this.notice.set(null);
  }

  clearLog() {
    this.commsLog.set([]);
    this.addLog('SYSTEM', 'Activity log cleared by user', undefined, 'info');
  }

  addLog(
    category: ActivityLogEntry['category'],
    message: string,
    detail?: string,
    level: ActivityLogEntry['level'] = 'info'
  ) {
    const entry: ActivityLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      category,
      message,
      detail,
      level,
    };
    this.commsLog.update((logs) => [entry, ...logs.slice(0, 49)]);
  }

  ngOnDestroy() {
    if (this.telemetryTimer !== null) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    for (const un of this.unlisten) un();
    this.unlisten = [];
  }
}
