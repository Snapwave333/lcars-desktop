import { Injectable, effect, signal } from '@angular/core';

export type ViewMode = 'list' | 'grid';

interface Persisted {
  view: ViewMode;
  showHidden: boolean;
}

const KEY = 'lcars.settings.v2';
const DEFAULTS: Persisted = { view: 'list', showHidden: false };

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly initial = load();
  readonly view = signal<ViewMode>(this.initial.view);
  readonly showHidden = signal(this.initial.showHidden);

  constructor() {
    effect(() => {
      const value: Persisted = { view: this.view(), showHidden: this.showHidden() };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        return;
      }
    });
  }
}
