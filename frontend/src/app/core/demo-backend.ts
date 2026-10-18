import type { Backend, BackendEvents } from './backend';
import type {
  AlertMode,
  DirectoryListing,
  FsEntry,
  InstalledApp,
  ItemKind,
  QuickLocation,
  ShellStatus,
  Telemetry,
} from './models';

const HOME = 'C:\\Users\\Picard';
const DESKTOP = `${HOME}\\Desktop`;
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);

type Spec = [name: string, kind: ItemKind, size: number, ageDays: number];

const TREE: Record<string, Spec[]> = {
  [DESKTOP]: [
    ['Projects', 'folder', 0, 1],
    ['Holodeck Programs', 'folder', 0, 12],
    ['Visual Studio Code.lnk', 'shortcut', 2_331, 40],
    ['Steam.lnk', 'shortcut', 1_904, 90],
    ['Windows Terminal.lnk', 'shortcut', 1_420, 30],
    ['Captains Log 47634.44.md', 'document', 18_220, 0],
    ['Warp Field Analysis.xlsx', 'document', 482_113, 3],
    ['Enterprise-D Schematic.png', 'image', 4_812_331, 8],
    ['deploy-probe.ps1', 'script', 3_912, 2],
    ['subspace-relay.exe', 'executable', 12_884_901, 21],
    ['tricorder.dump', 'file', 73_400_320, 5],
  ],
  [`${DESKTOP}\\Projects`]: [
    ['lcars-desktop', 'folder', 0, 0],
    ['dilithium-calibrator', 'folder', 0, 6],
    ['README.md', 'document', 5_120, 1],
    ['build.cmd', 'script', 880, 1],
  ],
  [`${DESKTOP}\\Holodeck Programs`]: [
    ['Dixon Hill.holo', 'file', 2_147_483_648, 44],
    ['Sherlock Holmes.holo', 'file', 1_610_612_736, 120],
    ['Vulcan Meditation.mp4', 'file', 734_003_200, 60],
  ],
  [HOME]: [
    ['Desktop', 'folder', 0, 0],
    ['Documents', 'folder', 0, 2],
    ['Downloads', 'folder', 0, 0],
    ['Pictures', 'folder', 0, 9],
    ['Music', 'folder', 0, 30],
    ['.gitconfig', 'file', 512, 200],
  ],
  [`${HOME}\\Documents`]: [
    ['Starfleet Reports', 'folder', 0, 4],
    ['Prime Directive.pdf', 'document', 2_202_009, 365],
    ['Crew Evaluations.docx', 'document', 88_311, 14],
  ],
  [`${HOME}\\Downloads`]: [
    ['rustup-init.exe', 'executable', 9_437_184, 1],
    ['node-v22-x64.msi', 'executable', 30_408_704, 3],
    ['earl-grey-recipe.txt', 'document', 640, 0],
  ],
  [`${HOME}\\Pictures`]: [
    ['Nebula.jpg', 'image', 6_291_456, 15],
    ['Away Team.png', 'image', 2_097_152, 33],
  ],
  'C:\\': [
    ['Program Files', 'folder', 0, 20],
    ['Users', 'folder', 0, 100],
    ['Windows', 'folder', 0, 3],
  ],
};

function entries(dir: string): FsEntry[] {
  return (TREE[dir] ?? []).map(([filename, kind, size, age]) => {
    const dot = filename.lastIndexOf('.');
    const ext = kind === 'folder' || dot <= 0 ? '' : filename.slice(dot + 1).toLowerCase();
    return {
      name: kind === 'shortcut' ? filename.slice(0, dot) : filename,
      filename,
      path: `${dir.replace(/\\$/, '')}\\${filename}`,
      item_type: kind,
      extension: ext,
      size_bytes: size,
      modified_epoch: NOW - age * DAY - ((filename.length * 977) % DAY),
      hidden: filename.startsWith('.'),
    };
  });
}

const APPS: [string, string, string][] = [
  ['Visual Studio Code', 'DEVELOPMENT', 'c-lavender'],
  ['Windows Terminal', 'DEVELOPMENT', 'c-lavender'],
  ['Git Bash', 'DEVELOPMENT', 'c-lavender'],
  ['Docker Desktop', 'DEVELOPMENT', 'c-lavender'],
  ['Python 3.13', 'DEVELOPMENT', 'c-lavender'],
  ['Steam', 'GAMES', 'c-orange'],
  ['Star Trek Online', 'GAMES', 'c-orange'],
  ['Epic Games Launcher', 'GAMES', 'c-orange'],
  ['Firefox', 'INTERNET & COMMS', 'c-sky'],
  ['Google Chrome', 'INTERNET & COMMS', 'c-sky'],
  ['Discord', 'INTERNET & COMMS', 'c-sky'],
  ['Slack', 'INTERNET & COMMS', 'c-sky'],
  ['OBS Studio', 'MEDIA & GRAPHICS', 'c-pink'],
  ['Blender', 'MEDIA & GRAPHICS', 'c-pink'],
  ['VLC media player', 'MEDIA & GRAPHICS', 'c-pink'],
  ['Spotify', 'MEDIA & GRAPHICS', 'c-pink'],
  ['Word', 'OFFICE', 'c-peach'],
  ['Excel', 'OFFICE', 'c-peach'],
  ['OneNote', 'OFFICE', 'c-peach'],
  ['Task Manager', 'SYSTEM & ADMIN', 'c-gold'],
  ['Event Viewer', 'SYSTEM & ADMIN', 'c-gold'],
  ['Disk Cleanup', 'SYSTEM & ADMIN', 'c-gold'],
  ['7-Zip File Manager', 'SYSTEM & ADMIN', 'c-gold'],
  ['Snipping Tool', 'UTILITY & TOOLS', 'c-teal'],
  ['Calculator', 'UTILITY & TOOLS', 'c-teal'],
  ['PowerToys', 'UTILITY & TOOLS', 'c-teal'],
];

const delay = <T>(value: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export class DemoBackend implements Backend {
  readonly live = false;
  private handlers: BackendEvents | null = null;
  private cpu = 18;
  private mem = 41;
  private readonly bootedAt = Date.now() - 2.4 * DAY * 1000;
  private shell: ShellStatus = { autostart_enabled: false, lcars_shell_active: false, current_shell: 'explorer.exe' };

  telemetry(): Promise<Telemetry> {
    this.cpu = Math.min(97, Math.max(3, this.cpu + (Math.random() - 0.48) * 14));
    this.mem = Math.min(92, Math.max(25, this.mem + (Math.random() - 0.5) * 3));
    const total = 32768;
    return delay(
      {
        hostname: 'NCC-1701-D',
        username: 'Picard',
        os: 'Windows 11 24H2 (build 26100)',
        arch: 'x86_64',
        cpu_cores: 16,
        cpu_load_percent: Math.round(this.cpu * 10) / 10,
        total_memory_mb: total,
        available_memory_mb: Math.round(total * (1 - this.mem / 100)),
        memory_load_percent: Math.round(this.mem),
        disk_total_gb: 1863,
        disk_free_gb: 712.4,
        uptime_seconds: Math.floor((Date.now() - this.bootedAt) / 1000),
        wallpaper_path: '',
        app_version: 'demo',
      },
      40,
    );
  }

  listDirectory(path: string | null): Promise<DirectoryListing> {
    const dir = path?.trim() || '';
    if (!dir) {
      return delay({ path: '', parent: null, items: entries(DESKTOP), truncated: false });
    }
    const key = Object.keys(TREE).find((k) => k.toLowerCase() === dir.replace(/\\+$/, '').toLowerCase() || k === dir);
    if (!key) {
      return Promise.reject(`not a directory: ${dir}`);
    }
    const idx = key.lastIndexOf('\\', key.length - 2);
    const parent = key.endsWith(':\\') ? null : key.slice(0, idx === 2 ? 3 : idx);
    return delay({ path: key, parent, items: entries(key), truncated: false });
  }

  quickLocations(): Promise<QuickLocation[]> {
    return delay([
      { id: 'desktop', name: 'DESKTOP', path: DESKTOP },
      { id: 'downloads', name: 'DOWNLOADS', path: `${HOME}\\Downloads` },
      { id: 'documents', name: 'DOCUMENTS', path: `${HOME}\\Documents` },
      { id: 'pictures', name: 'PICTURES', path: `${HOME}\\Pictures` },
      { id: 'userhome', name: 'USER PROFILE', path: HOME },
      { id: 'rootdrive', name: 'SYSTEM DRIVE (C:)', path: 'C:\\' },
    ]);
  }

  installedApps(): Promise<InstalledApp[]> {
    const sorted = [...APPS].sort((a, b) => a[0].localeCompare(b[0]));
    return delay(
      sorted.map(([name, category, color], i) => ({
        id: `app-${i + 1}`,
        code: `APP-${String(i + 1).padStart(3, '0')}`,
        name,
        category,
        color,
        path: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${name}.lnk`,
      })),
      300,
    );
  }

  shellStatus() {
    return delay({ ...this.shell });
  }

  async open() {
    await delay(null, 60);
  }

  async reveal() {
    await delay(null, 60);
  }

  launch() {
    return delay({ pid: 4000 + Math.floor(Math.random() * 20000) }, 90);
  }

  async setAlert(mode: AlertMode) {
    await delay(null, 10);
    this.handlers?.alert(mode);
  }

  async notify(title: string, body: string) {
    await delay(null, 10);
    this.handlers?.notify({ title, body });
  }

  async windowAction() {
    await delay(null, 10);
  }

  async setAutoStart(enable: boolean) {
    this.shell = { ...this.shell, autostart_enabled: enable };
    await delay(null);
  }

  async setShell(target: 'lcars' | 'explorer') {
    this.shell = {
      ...this.shell,
      lcars_shell_active: target === 'lcars',
      current_shell: target === 'lcars' ? '"C:\\Program Files\\LCARS Shell\\lcars-shell.exe"' : 'explorer.exe',
    };
    await delay(null);
  }

  async subscribe(handlers: BackendEvents) {
    this.handlers = handlers;
    return () => (this.handlers = null);
  }
}
