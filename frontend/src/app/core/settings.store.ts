import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'tng' | 'voyager' | 'nemesis' | 'lower-decks';
export type ViewMode = 'list' | 'grid';

export const THEMES: { id: Theme; name: string; era: string; swatch: string[] }[] = [
  { id: 'tng', name: 'NEXT GENERATION', era: '2364', swatch: ['#ff9900', '#cc99cc', '#9999ff', '#ffcc99'] },
  { id: 'voyager', name: 'VOYAGER', era: '2371', swatch: ['#cc99cc', '#9999cc', '#ff9966', '#99ccff'] },
  { id: 'nemesis', name: 'NEMESIS BLUE', era: '2379', swatch: ['#2255ff', '#99ccff', '#ff8800', '#f5f6fa'] },
  { id: 'lower-decks', name: 'LOWER DECKS', era: '2380', swatch: ['#ff7700', '#ffaa44', '#ff5555', '#88ccff'] },
];

interface Persisted {
  theme: Theme;
  view: ViewMode;
  showHidden: boolean;
}

const KEY = 'lcars.settings.v1';
const DEFAULTS: Persisted = { theme: 'tng', view: 'list', showHidden: false };

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
  readonly theme = signal<Theme>(this.initial.theme);
  readonly view = signal<ViewMode>(this.initial.view);
  readonly showHidden = signal(this.initial.showHidden);

  constructor() {
    effect(() => {
      const value: Persisted = { theme: this.theme(), view: this.view(), showHidden: this.showHidden() };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        return;
      }
    });
  }
}
