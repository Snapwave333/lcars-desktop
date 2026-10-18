import { InjectionToken } from '@angular/core';
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

export interface BackendEvents {
  alert(mode: AlertMode): void;
  notify(payload: NotifyPayload): void;
  wallpaper(path: string): void;
  reload(): void;
}

export interface Backend {
  readonly live: boolean;
  telemetry(): Promise<Telemetry>;
  listDirectory(path: string | null): Promise<DirectoryListing>;
  quickLocations(): Promise<QuickLocation[]>;
  installedApps(rescan: boolean): Promise<InstalledApp[]>;
  shellStatus(): Promise<ShellStatus>;
  open(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  launch(path: string, args: string[]): Promise<LaunchResult>;
  setAlert(mode: AlertMode): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  windowAction(action: WindowAction): Promise<void>;
  setAutoStart(enable: boolean): Promise<void>;
  setShell(target: 'lcars' | 'explorer'): Promise<void>;
  subscribe(handlers: BackendEvents): Promise<() => void>;
}

export const BACKEND = new InjectionToken<Backend>('lcars.backend');

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
