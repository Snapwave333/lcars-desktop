export type AlertMode = 'none' | 'yellow' | 'red' | 'blue';

export type ItemKind = 'folder' | 'shortcut' | 'script' | 'executable' | 'image' | 'document' | 'file';

export interface FsEntry {
  name: string;
  filename: string;
  path: string;
  item_type: ItemKind;
  extension: string;
  size_bytes: number;
  modified_epoch: number;
  hidden: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  items: FsEntry[];
  truncated: boolean;
}

export interface QuickLocation {
  id: string;
  name: string;
  path: string;
}

export interface InstalledApp {
  id: string;
  name: string;
  path: string;
  category: string;
  code: string;
  color: string;
}

export interface Telemetry {
  hostname: string;
  username: string;
  os: string;
  arch: string;
  cpu_cores: number;
  cpu_load_percent: number;
  total_memory_mb: number;
  available_memory_mb: number;
  memory_load_percent: number;
  disk_total_gb: number;
  disk_free_gb: number;
  uptime_seconds: number;
  wallpaper_path: string;
  app_version: string;
}

export interface ShellStatus {
  autostart_enabled: boolean;
  lcars_shell_active: boolean;
  current_shell: string;
}

export interface LaunchResult {
  pid: number | null;
}

export interface NotifyPayload {
  title: string;
  body: string;
}

export type WindowAction = 'minimize' | 'maximize' | 'fullscreen' | 'close' | 'toggle';

export type LogCategory = 'APPLICATIONS' | 'FILESYSTEM' | 'SYSTEM' | 'ALERTS' | 'CONFIG';
export type LogLevel = 'info' | 'success' | 'warn' | 'alert';

export interface LogEntry {
  id: number;
  at: Date;
  category: LogCategory;
  level: LogLevel;
  message: string;
  detail?: string;
}

export interface ToolPreset {
  id: string;
  name: string;
  group: 'TERMINAL' | 'MANAGEMENT' | 'UTILITY';
  code: string;
  path: string;
  args?: string[];
  color: string;
  description: string;
}
