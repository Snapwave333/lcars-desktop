import { Component, OnDestroy, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CliBridgeService,
  type AlertMode,
  type DesktopItem,
  type QuickLocation,
  type InstalledApp,
} from './services/cli-bridge.service';

export type SubsystemId = 'desktop' | 'apps' | 'performance' | 'utilities' | 'shell-config' | 'activity-log';
export type LcarsTheme = '24th-century' | 'voyager' | 'nemesis' | 'tactical';
export type FileFilter = 'ALL' | 'shortcut' | 'folder' | 'script' | 'executable' | 'document' | 'image' | 'file';
export type FileSort = 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'date-desc' | 'date-asc';
export type ViewMode = 'grid' | 'table';

export interface BreadcrumbItem {
  label: string;
  path: string;
}

export interface WindowsAppPreset {
  id: string;
  name: string;
  category: 'TERMINAL' | 'MANAGEMENT' | 'UTILITY';
  code: string;
  path: string;
  args?: string[];
  color: string;
  description: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly cli = inject(CliBridgeService);

  readonly activeSubsystem = signal<SubsystemId>('desktop');
  readonly currentTheme = signal<LcarsTheme>('24th-century');
  readonly stardate = signal('41000.0');
  readonly clock = signal('00:00:00 AM');
  readonly dateFormatted = signal('00.00.0000');

  // File explorer & Desktop states
  readonly viewMode = signal<ViewMode>('grid');
  readonly desktopFilter = signal<FileFilter>('ALL');
  readonly fileSort = signal<FileSort>('name-asc');
  desktopSearch = '';
  customDirPath = '';
  readonly selectedItem = signal<DesktopItem | null>(null);
  readonly copiedNotification = signal<string | null>(null);

  // Applications search & filter
  appSearch = '';
  readonly appCategoryFilter = signal<string>('ALL');

  // Custom Application Runner
  launchPath = 'powershell.exe';
  launchArgs = '';
  launchDetached = true;
  readonly launchFeedback = signal<{ text: string; ok: boolean } | null>(null);

  // Notification Sender
  notificationTitle = 'SYSTEM NOTICE';
  notificationBody = 'Windows desktop shell verification nominal.';
  readonly logFilter = signal<'ALL' | 'APPLICATIONS' | 'FILESYSTEM' | 'SYSTEM' | 'ALERTS' | 'CONFIG'>('ALL');

  // Directory History
  readonly pathHistory = signal<string[]>([]);

  // Curated Windows Utilities
  readonly windowsTools: WindowsAppPreset[] = [
    { id: 'task', name: 'TASK MANAGER', category: 'MANAGEMENT', code: 'SYS-01', path: 'taskmgr.exe', color: 'c-orange', description: 'Monitor processes, performance & startup' },
    { id: 'ps', name: 'POWERSHELL', category: 'TERMINAL', code: 'CMD-01', path: 'powershell.exe', color: 'c-blue', description: 'Windows PowerShell Terminal' },
    { id: 'cmd', name: 'COMMAND PROMPT', category: 'TERMINAL', code: 'CMD-02', path: 'cmd.exe', color: 'c-sky', description: 'Standard Command Interpreter' },
    { id: 'wt', name: 'WINDOWS TERMINAL', category: 'TERMINAL', code: 'CMD-03', path: 'wt.exe', color: 'c-peri', description: 'Modern Tabbed Terminal' },
    { id: 'reg', name: 'REGISTRY EDITOR', category: 'MANAGEMENT', code: 'SYS-02', path: 'regedit.exe', color: 'c-peach', description: 'Windows Registry Configuration' },
    { id: 'ctrl', name: 'CONTROL PANEL', category: 'MANAGEMENT', code: 'SYS-03', path: 'control.exe', color: 'c-gold', description: 'Classic Control Panel Applets' },
    { id: 'settings', name: 'SYSTEM SETTINGS', category: 'MANAGEMENT', code: 'SYS-04', path: 'explorer.exe', args: ['ms-settings:'], color: 'c-lavender', description: 'Windows 11 Modern Settings' },
    { id: 'dev', name: 'DEVICE MANAGER', category: 'MANAGEMENT', code: 'SYS-05', path: 'devmgmt.msc', color: 'c-teal', description: 'Hardware Devices & Drivers' },
    { id: 'disk', name: 'DISK MANAGEMENT', category: 'MANAGEMENT', code: 'SYS-06', path: 'diskmgmt.msc', color: 'c-gold', description: 'Partitions & Storage Drives' },
    { id: 'event', name: 'EVENT VIEWER', category: 'MANAGEMENT', code: 'SYS-07', path: 'eventvwr.msc', color: 'c-peri', description: 'Windows Diagnostics & Event Logs' },
    { id: 'serv', name: 'SERVICES', category: 'MANAGEMENT', code: 'SYS-08', path: 'services.msc', color: 'c-blue', description: 'Windows Background Services' },
    { id: 'resmon', name: 'RESOURCE MONITOR', category: 'MANAGEMENT', code: 'SYS-09', path: 'resmon.exe', color: 'c-teal', description: 'In-Depth CPU, RAM & Disk Monitor' },
    { id: 'exp', name: 'FILE EXPLORER', category: 'UTILITY', code: 'UTL-01', path: 'explorer.exe', color: 'c-gold', description: 'Native Windows File Explorer' },
    { id: 'calc', name: 'CALCULATOR', category: 'UTILITY', code: 'UTL-02', path: 'calc.exe', color: 'c-peach', description: 'Windows Standard Calculator' },
    { id: 'note', name: 'NOTEPAD', category: 'UTILITY', code: 'UTL-03', path: 'notepad.exe', color: 'c-lavender', description: 'Fast Plain Text Editor' },
  ];

  // Segmented Breadcrumb computation
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const raw = this.cli.currentDirectory().trim();
    if (!raw) {
      return [{ label: 'DESKTOP', path: '' }];
    }
    const clean = raw.replace(/[\\/]+$/, '');
    const parts = clean.split(/[\\/]/);
    const crumbs: BreadcrumbItem[] = [{ label: 'DESKTOP', path: '' }];
    let acc = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0 && part.includes(':')) {
        acc = `${part}\\`;
        crumbs.push({ label: part, path: acc });
      } else {
        acc = acc ? (acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`) : part;
        crumbs.push({ label: part, path: acc });
      }
    }
    return crumbs;
  });

  // Category counts computation for filter tabs
  readonly categoryCounts = computed(() => {
    const items = this.cli.desktopItems();
    return {
      all: items.length,
      shortcut: items.filter((i) => i.item_type === 'shortcut').length,
      folder: items.filter((i) => i.item_type === 'folder').length,
      script: items.filter((i) => i.item_type === 'script').length,
      executable: items.filter((i) => i.item_type === 'executable').length,
      document: items.filter((i) => i.item_type === 'document').length,
      image: items.filter((i) => i.item_type === 'image').length,
    };
  });

  // Filtered Installed Apps (130+ discovered real Windows apps)
  readonly filteredInstalledApps = computed(() => {
    const cat = this.appCategoryFilter();
    const q = this.appSearch.trim().toLowerCase();
    return this.cli.installedApps().filter((app) => {
      if (cat !== 'ALL' && app.category !== cat) return false;
      if (q && !app.name.toLowerCase().includes(q) && !app.category.toLowerCase().includes(q) && !app.code.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  readonly installedAppCategories = computed(() => {
    const apps = this.cli.installedApps();
    const set = new Set<string>();
    apps.forEach((a) => set.add(a.category));
    return ['ALL', ...Array.from(set).sort()];
  });

  // Segmented LCARS Meter blocks (20 segments = 5% each)
  readonly memoryMeterSegments = computed(() => {
    const pct = this.cli.telemetry().memory_load_percent;
    return Array.from({ length: 20 }, (_, i) => ({
      index: i,
      active: (i + 1) * 5 <= pct,
    }));
  });

  private readonly clockTimer = setInterval(() => this.tick(), 1000);

  constructor() {
    this.tick();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.copiedNotification()) {
        this.copiedNotification.set(null);
      } else if (this.selectedItem()) {
        this.selectedItem.set(null);
      } else if (this.desktopSearch) {
        this.desktopSearch = '';
      } else if (this.cli.notice()) {
        this.clearNotice();
      }
    } else if (event.key === 'F5') {
      event.preventDefault();
      void this.refreshCurrentDirectory();
    }
  }

  selectSubsystem(id: SubsystemId) {
    this.activeSubsystem.set(id);
    if (id === 'apps' && this.cli.installedApps().length === 0) {
      void this.cli.fetchInstalledApps();
    }
  }

  setTheme(theme: LcarsTheme) {
    this.currentTheme.set(theme);
    this.cli.addLog('CONFIG', `LCARS visual theme changed: ${theme.toUpperCase()}`, undefined, 'info');
  }

  async setAlert(mode: AlertMode) {
    await this.cli.setAlert(mode);
  }

  cycleAlert() {
    const cur = this.cli.alertMode();
    if (cur === 'none') {
      void this.setAlert('yellow');
    } else if (cur === 'yellow') {
      void this.setAlert('red');
    } else {
      void this.setAlert('none');
    }
  }

  // --- File Explorer & Desktop Operations ---

  async refreshCurrentDirectory() {
    await this.cli.listDirectory(this.cli.currentDirectory());
  }

  async navigateToPath(path: string) {
    const cur = this.cli.currentDirectory();
    if (cur && cur !== path) {
      this.pathHistory.update((h) => [...h, cur]);
    }
    await this.cli.listDirectory(path);
    this.customDirPath = path;
    this.selectedItem.set(null);
  }

  async navigateToQuickLocation(loc: QuickLocation) {
    this.activeSubsystem.set('desktop');
    await this.navigateToPath(loc.path);
  }

  async navigateBack() {
    const hist = this.pathHistory();
    if (hist.length > 0) {
      const prev = hist[hist.length - 1];
      this.pathHistory.update((h) => h.slice(0, -1));
      await this.cli.listDirectory(prev);
      this.customDirPath = prev;
      this.selectedItem.set(null);
    } else {
      await this.navigateToPath('');
    }
  }

  async navigateUp() {
    const cur = this.cli.currentDirectory();
    if (!cur) return;
    const parts = cur.replace(/[\\/]+$/, '').split(/[\\/]/);
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join('\\') + (parts.length === 2 && parts[0].endsWith(':') ? '\\' : '');
      await this.navigateToPath(parent);
    } else {
      await this.navigateToPath('');
    }
  }

  async onCustomPathSubmit() {
    if (this.customDirPath.trim()) {
      await this.navigateToPath(this.customDirPath.trim());
    } else {
      await this.navigateToPath('');
    }
  }

  selectItem(item: DesktopItem) {
    this.selectedItem.set(item);
  }

  async openItem(item: DesktopItem) {
    if (item.item_type === 'folder') {
      await this.navigateToPath(item.path);
    } else {
      await this.cli.openItem(item.path);
    }
  }

  async openSelectedItem() {
    const item = this.selectedItem();
    if (item) {
      await this.openItem(item);
    }
  }

  async revealSelectedItem() {
    const item = this.selectedItem();
    if (item) {
      await this.cli.revealItem(item.path);
    }
  }

  async openCurrentFolderInExplorer() {
    const dir = this.cli.currentDirectory() || 'Desktop';
    await this.cli.openItem(dir);
  }

  async copyItemPath(item: DesktopItem) {
    try {
      await navigator.clipboard.writeText(item.path);
      this.copiedNotification.set(`COPIED TO CLIPBOARD: ${item.path}`);
      setTimeout(() => this.copiedNotification.set(null), 3000);
    } catch {
      this.copiedNotification.set(`FAILED TO COPY`);
      setTimeout(() => this.copiedNotification.set(null), 3000);
    }
  }

  // --- App Launcher ---

  async launchInstalledApp(app: InstalledApp) {
    await this.cli.openItem(app.path);
  }

  async launchPreset(app: WindowsAppPreset) {
    await this.cli.launchApp(app.path, app.args, true);
  }

  async runCustomCommand() {
    if (!this.launchPath.trim()) return;
    const args = this.launchArgs.trim() ? this.launchArgs.split(' ') : [];
    const res = await this.cli.launchApp(this.launchPath, args, this.launchDetached);
    if (res.ok) {
      this.launchFeedback.set({ text: `Launched PID: ${res.pid ?? 'Detached'}`, ok: true });
    } else {
      this.launchFeedback.set({ text: `Failed: ${res.error ?? 'Unknown error'}`, ok: false });
    }
    setTimeout(() => this.launchFeedback.set(null), 4000);
  }

  // --- Filtering & Sorting ---

  filteredItems(): DesktopItem[] {
    const items = this.cli.desktopItems();
    const filter = this.desktopFilter();
    const q = this.desktopSearch.trim().toLowerCase();
    const sort = this.fileSort();

    let result = items.filter((item) => {
      if (filter === 'shortcut' && item.item_type !== 'shortcut') return false;
      if (filter === 'folder' && item.item_type !== 'folder') return false;
      if (filter === 'script' && item.item_type !== 'script') return false;
      if (filter === 'executable' && item.item_type !== 'executable') return false;
      if (filter === 'document' && item.item_type !== 'document') return false;
      if (filter === 'image' && item.item_type !== 'image') return false;
      if (filter === 'file' && item.item_type !== 'file') return false;

      if (q && !item.name.toLowerCase().includes(q) && !item.filename.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (a.item_type === 'folder' && b.item_type !== 'folder') return -1;
      if (a.item_type !== 'folder' && b.item_type === 'folder') return 1;

      switch (sort) {
        case 'name-asc':
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'name-desc':
          return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'size-desc':
          return b.size_bytes - a.size_bytes;
        case 'size-asc':
          return a.size_bytes - b.size_bytes;
        case 'date-desc':
          return b.modified_epoch - a.modified_epoch;
        case 'date-asc':
          return a.modified_epoch - b.modified_epoch;
        default:
          return 0;
      }
    });

    return result;
  }

  getItemBadgeColor(item: DesktopItem): string {
    switch (item.item_type) {
      case 'shortcut': return 'c-sky';
      case 'folder': return 'c-gold';
      case 'script': return 'c-orange';
      case 'executable': return 'c-peach';
      case 'document': return 'c-lavender';
      case 'image': return 'c-teal';
      default: return 'c-peri';
    }
  }

  getItemCode(item: DesktopItem): string {
    switch (item.item_type) {
      case 'shortcut': return 'LNK-APP';
      case 'folder': return 'DIR-FLD';
      case 'script': return 'BAT-SCR';
      case 'executable': return 'BIN-EXE';
      case 'document': return 'DOC-FIL';
      case 'image': return 'IMG-GFX';
      default: return 'DAT-SYS';
    }
  }

  formatFileSize(item: DesktopItem): string {
    if (item.item_type === 'folder') return 'FOLDER';
    const bytes = item.size_bytes;
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  formatDate(epoch: number): string {
    if (!epoch) return 'N/A';
    const d = new Date(epoch * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(hours)}:${p(d.getMinutes())} ${ampm}`;
  }

  // --- Window Operations ---

  async minimizeWindow() {
    await this.cli.minimizeWindow();
  }

  async maximizeWindow() {
    await this.cli.maximizeWindow();
  }

  async toggleFullscreen() {
    await this.cli.toggleFullscreen();
  }

  async closeWindow() {
    await this.cli.closeWindow();
  }

  async broadcastNotification() {
    if (!this.notificationTitle.trim()) return;
    await this.cli.sendNotification(this.notificationTitle, this.notificationBody);
  }

  filteredLogs() {
    const filter = this.logFilter();
    const logs = this.cli.commsLog();
    if (filter === 'ALL') return logs;
    return logs.filter((l) => l.category === filter);
  }

  clearNotice() {
    this.cli.clearNotice();
  }

  // --- Helpers ---

  formatUptime(sec: number): string {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const p = (n: number) => String(n).padStart(2, '0');
    if (d > 0) return `${d}D ${p(h)}H ${p(m)}M ${p(s)}S`;
    return `${p(h)}:${p(m)}:${p(s)}`;
  }

  formatMemory(mb: number): string {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  }

  private tick() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayFrac = (now.getTime() - start.getTime()) / 86400000 / 365.2425;
    const sd = 41000 + (now.getFullYear() - 2026) * 1000 + Math.floor(dayFrac * 1000);
    this.stardate.set(sd.toFixed(1));

    const hours24 = now.getHours();
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const p = (n: number) => String(n).padStart(2, '0');
    this.clock.set(`${p(hours12)}:${p(now.getMinutes())}:${p(now.getSeconds())} ${ampm}`);
    this.dateFormatted.set(`${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}`);
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
  }
}
