import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Backend, BackendEvents } from './backend';
import type {
  AlertMode,
  DirectoryListing,
  InstalledApp,
  LaunchResult,
  NotifyPayload,
  QuickLocation,
  ShellStatus,
  Telemetry,
  WindowAction,
} from './models';

export class TauriBackend implements Backend {
  readonly live = true;

  telemetry() {
    return invoke<Telemetry>('get_system_info');
  }

  listDirectory(path: string | null) {
    return invoke<DirectoryListing>('list_directory', { path: path?.trim() || null });
  }

  quickLocations() {
    return invoke<QuickLocation[]>('get_quick_locations');
  }

  installedApps(rescan: boolean) {
    return invoke<InstalledApp[]>('get_installed_apps', { rescan });
  }

  shellStatus() {
    return invoke<ShellStatus>('get_shell_status');
  }

  async open(path: string) {
    await invoke('open_item', { path });
  }

  async reveal(path: string) {
    await invoke('reveal_item', { path });
  }

  launch(path: string, args: string[]) {
    return invoke<LaunchResult>('launch_app', { path, args });
  }

  async setAlert(mode: AlertMode) {
    await invoke('alert', { mode });
  }

  async notify(title: string, body: string) {
    await invoke('send_notification', { title, body });
  }

  async windowAction(action: WindowAction) {
    await invoke('window_action', { action });
  }

  async setAutoStart(enable: boolean) {
    await invoke('set_auto_start', { enable });
  }

  async setShell(target: 'lcars' | 'explorer') {
    await invoke('set_windows_shell', { target });
  }

  async subscribe(h: BackendEvents) {
    const offs = await Promise.all([
      listen<AlertMode>('lcars://alert', (e) => h.alert(e.payload)),
      listen<NotifyPayload>('lcars://notify', (e) => h.notify(e.payload)),
      listen<string>('lcars://wallpaper', (e) => h.wallpaper(e.payload)),
      listen('lcars://reload', () => h.reload()),
    ]);
    return () => offs.forEach((off) => off());
  }
}
