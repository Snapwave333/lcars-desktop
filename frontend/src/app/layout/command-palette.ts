import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { NAV } from '../app.routes';
import { AppsStore, CATEGORY_ICON, TOOLS } from '../core/apps.store';
import { FilesStore } from '../core/files.store';
import { SystemStore } from '../core/system.store';
import { Icon } from '../shared/icon';
import type { IconName } from '../shared/icon-data';

interface Command {
  id: string;
  group: string;
  label: string;
  hint: string;
  icon: IconName;
  color: string;
  run: () => unknown;
}

export function score(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const at = l.indexOf(q);
  if (at === 0) return 100;
  if (at > 0) return 80 - Math.min(at, 40) + (l[at - 1] === ' ' ? 15 : 0);
  let i = 0;
  for (const ch of l) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

@Component({
  selector: 'app-command-palette',
  imports: [Icon],
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKey($event)' },
})
export class CommandPalette {
  readonly closed = output<void>();
  private readonly router = inject(Router);
  private readonly apps = inject(AppsStore);
  private readonly files = inject(FilesStore);
  private readonly system = inject(SystemStore);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('q');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');
  protected readonly index = signal(0);

  private readonly commands = computed<Command[]>(() => [
    ...NAV.map((n) => ({
      id: `nav-${n.path}`,
      group: 'SUBSYSTEM',
      label: n.title,
      hint: `KEY ${n.key}`,
      icon: n.icon,
      color: n.color,
      run: () => this.router.navigate([n.path]),
    })),
    ...this.system.quickLocations().map((l) => ({
      id: `loc-${l.id}`,
      group: 'LOCATION',
      label: l.name,
      hint: l.path,
      icon: 'folder' as IconName,
      color: 'c-gold',
      run: () => {
        void this.router.navigate(['files']);
        return this.files.navigate(l.path);
      },
    })),
    ...TOOLS.map((t) => ({
      id: `tool-${t.id}`,
      group: 'TOOL',
      label: t.name,
      hint: t.path,
      icon: (t.group === 'TERMINAL' ? 'terminal' : t.group === 'MANAGEMENT' ? 'settings' : 'handyman') as IconName,
      color: t.color,
      run: () => this.apps.run(t.path, t.args ?? [], t.name),
    })),
    ...this.apps.apps().map((a) => ({
      id: a.id,
      group: 'APPLICATION',
      label: a.name.toUpperCase(),
      hint: a.category,
      icon: CATEGORY_ICON[a.category] ?? ('apps' as IconName),
      color: a.color,
      run: () => this.apps.launchApp(a),
    })),
    { id: 'alert-red', group: 'ACTION', label: 'RED ALERT', hint: 'ALERT', icon: 'thunderstorm', color: 'c-red', run: () => this.system.setAlert('red') },
    { id: 'alert-yellow', group: 'ACTION', label: 'YELLOW ALERT', hint: 'ALERT', icon: 'warning', color: 'c-gold', run: () => this.system.setAlert('yellow') },
    { id: 'alert-none', group: 'ACTION', label: 'STAND DOWN', hint: 'ALERT', icon: 'shield', color: 'c-teal', run: () => this.system.setAlert('none') },
  ]);

  protected readonly results = computed(() => {
    const q = this.query();
    return this.commands()
      .map((c) => ({ c, s: Math.max(score(c.label, q), c.hint.toLowerCase().includes(q.toLowerCase().trim()) ? 30 : 0) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.c);
  });

  constructor() {
    this.apps.ensureLoaded();
    afterNextRender(() => this.input().nativeElement.focus());
  }

  protected setQuery(v: string) {
    this.query.set(v);
    this.index.set(0);
  }

  protected run(c: Command) {
    this.closed.emit();
    void c.run();
  }

  protected onKey(e: KeyboardEvent) {
    const n = this.results().length;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closed.emit();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      this.index.update((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      queueMicrotask(() =>
        this.list()?.nativeElement.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = this.results()[this.index()];
      if (c) this.run(c);
    }
  }
}
