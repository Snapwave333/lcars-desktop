import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { NAV, type NavItem } from './app.routes';
import { formatClock, stardate } from './core/format';
import { FilesStore } from './core/files.store';
import { LogStore } from './core/log.store';
import { SettingsStore } from './core/settings.store';
import { SystemStore } from './core/system.store';
import { CommandPalette } from './layout/command-palette';
import { DataCascade } from './layout/data-cascade';
import { Toasts } from './layout/toasts';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DataCascade, Toasts, CommandPalette, Icon],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-theme]': 'settings.theme()',
    '[attr.data-alert]': 'system.alert()',
    '(window:keydown)': 'onKey($event)',
  },
})
export class App {
  protected readonly system = inject(SystemStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly log = inject(LogStore);
  private readonly files = inject(FilesStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly nav = NAV;
  protected readonly now = signal(new Date());
  protected readonly clock = computed(() => formatClock(this.now()));
  protected readonly stardate = computed(() => stardate(this.now()));
  protected readonly paletteOpen = signal(false);

  protected readonly current = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => {
        let r = this.route.snapshot;
        while (r.firstChild) r = r.firstChild;
        return (r.data['nav'] as NavItem | undefined) ?? NAV[0];
      }),
    ),
    { initialValue: NAV[0] },
  );

  protected readonly alertLabel = computed(() => {
    switch (this.system.alert()) {
      case 'red':
        return 'RED ALERT';
      case 'yellow':
        return 'YELLOW ALERT';
      case 'blue':
        return 'BLUE ALERT';
      default:
        return 'CONDITION GREEN';
    }
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect(() => {
      document.title = `LCARS // ${this.current().title}`;
    });
  }

  protected onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.togglePalette();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || this.paletteOpen()) return;
    const item = NAV.find((n) => n.key === e.key);
    if (item) {
      e.preventDefault();
      void this.router.navigate([item.path]);
    } else if (e.key === '/') {
      e.preventDefault();
      this.togglePalette();
    } else if (e.key === 'F11') {
      e.preventDefault();
      void this.system.windowAction('fullscreen');
    }
  }

  protected openLocation(path: string) {
    void this.router.navigate(['files']);
    void this.files.navigate(path);
  }

  protected togglePalette() {
    this.paletteOpen.update((v) => !v);
  }
}
