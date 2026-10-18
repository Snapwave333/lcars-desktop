import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { evaluate } from './calc';
import {
  BROWSER_COMMANDS,
  CLIENT_COMMANDS,
  CommandSpec,
  Step,
  Surface,
  mergeCatalogs,
  missingArgs,
  resolve,
} from './catalog';

export type AlertMode = 'red' | 'yellow' | 'blue' | 'none';

export interface ShellEvent {
  kind: 'notify' | 'alert';
  title?: string;
  body?: string;
  mode?: AlertMode;
}

export interface StepOutcome {
  ok: boolean;
  data?: unknown;
  error?: string;
  ms: number;
}

const ALERT_MODES: AlertMode[] = ['red', 'yellow', 'blue', 'none'];

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

@Injectable({ providedIn: 'root' })
export class RuntimeService implements OnDestroy {
  private readonly zone = inject(NgZone);
  private unlisten: UnlistenFn[] = [];
  private listeners: ((e: ShellEvent) => void)[] = [];

  readonly surface = signal<Surface>(isDesktop() ? 'desktop' : 'browser');
  readonly catalog = signal<CommandSpec[]>(mergeCatalogs(CLIENT_COMMANDS, BROWSER_COMMANDS));
  readonly alert = signal<AlertMode>('none');

  constructor() {
    if (this.surface() === 'desktop') {
      void this.connectDesktop();
    }
  }

  onEvent(fn: (e: ShellEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private emit(e: ShellEvent) {
    this.zone.run(() => {
      if (e.kind === 'alert' && e.mode) this.alert.set(e.mode);
      for (const l of this.listeners) l(e);
    });
  }

  private async connectDesktop() {
    try {
      const remote = await invoke<CommandSpec[]>('list_commands');
      if (Array.isArray(remote) && remote.length) {
        this.catalog.set(mergeCatalogs(CLIENT_COMMANDS, remote));
      }
      this.unlisten.push(
        await listen<string>('lcars://alert', (ev) => this.emit({ kind: 'alert', mode: ev.payload as AlertMode })),
        await listen<{ title: string; body: string }>('lcars://notify', (ev) =>
          this.emit({ kind: 'notify', title: ev.payload.title, body: ev.payload.body })
        ),
        await listen('lcars://reload', () => window.location.reload())
      );
    } catch {
      this.surface.set('browser');
    }
  }

  async run(step: Step, signal?: AbortSignal): Promise<StepOutcome> {
    const started = performance.now();
    const done = (o: Omit<StepOutcome, 'ms'>): StepOutcome => ({ ...o, ms: Math.round(performance.now() - started) });
    const spec = resolve(this.catalog(), step.cmd);
    if (!spec) return done({ ok: false, error: `unknown command '${step.cmd}'` });
    const missing = missingArgs(spec, step.args);
    if (missing.length) {
      return done({ ok: false, error: `'${spec.name}' needs ${missing.map((m) => `${m.name} (${m.help})`).join(', ')}` });
    }
    try {
      if (signal?.aborted) throw new Error('cancelled');
      const local = this.surface() === 'browser' || spec.client;
      const data = local ? await this.runLocal(spec.name, step.args, signal) : await this.runDesktop(spec.name, step.args);
      return done({ ok: true, data });
    } catch (err) {
      return done({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private runDesktop(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    return invoke('run_command', { cmd, args });
  }

  private async runLocal(cmd: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const text = (k: string) => String(args[k] ?? '').trim();
    switch (cmd) {
      case 'calc': {
        const expr = text('expr');
        return { expr, result: evaluate(expr) };
      }
      case 'time': {
        const now = new Date();
        return {
          time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          date: now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          iso: now.toISOString(),
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      case 'echo':
        return { text: text('text') };
      case 'copy': {
        await navigator.clipboard.writeText(text('text'));
        return { copied: true, chars: text('text').length };
      }
      case 'web-search': {
        const url = `https://www.google.com/search?q=${encodeURIComponent(text('query'))}`;
        await this.openUrl(url);
        return { url, query: text('query') };
      }
      case 'open': {
        const path = text('path');
        if (!/^https?:\/\//i.test(path)) throw new Error('local files and apps need the LCARS desktop app');
        await this.openUrl(path);
        return { opened: true, path };
      }
      case 'wait': {
        const ms = Math.min(60000, Math.max(0, Number(args['ms']) || 0));
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, ms);
          signal?.addEventListener('abort', () => {
            clearTimeout(t);
            rej(new Error('cancelled'));
          });
        });
        return { waited_ms: ms };
      }
      case 'alert': {
        const raw = text('mode').toLowerCase();
        const mode = (raw === 'green' || raw === 'normal' ? 'none' : raw) as AlertMode;
        if (!ALERT_MODES.includes(mode)) throw new Error(`unknown alert mode '${raw}' (red | yellow | blue | none)`);
        this.emit({ kind: 'alert', mode });
        return { mode };
      }
      case 'notify': {
        const payload = { title: text('title'), body: text('body') };
        this.emit({ kind: 'notify', ...payload });
        return payload;
      }
      case 'help':
        return this.catalog().map(({ name, plugin, summary }) => ({ name, plugin, summary }));
      case 'ping':
        return { pong: true, timestamp_ms: Date.now() };
      case 'status':
        return { running: true, surface: this.surface(), commands: this.catalog().length };
      case 'info': {
        const nav = navigator as Navigator & { deviceMemory?: number };
        return {
          surface: 'browser',
          platform: nav.platform || 'unknown',
          language: nav.language,
          cpu_cores: nav.hardwareConcurrency ?? 0,
          memory_gb: nav.deviceMemory ?? 'unknown',
          online: nav.onLine,
          screen: `${screen.width}×${screen.height}`,
        };
      }
      default:
        throw new Error(`'${cmd}' needs the LCARS desktop app`);
    }
  }

  private async openUrl(url: string) {
    if (this.surface() === 'desktop') {
      await invoke('run_command', { cmd: 'open', args: { path: url } });
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  ngOnDestroy() {
    for (const u of this.unlisten) u();
    this.unlisten = [];
  }
}
