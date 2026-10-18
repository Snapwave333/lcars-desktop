import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AppsStore } from '../../core/apps.store';
import { Icon } from '../../shared/icon';
import type { IconName } from '../../shared/icon-data';

export const CATEGORY_ICON: Record<string, IconName> = {
  ALL: 'apps',
  DEVELOPMENT: 'code',
  GAMES: 'sports_esports',
  'INTERNET & COMMS': 'chat',
  'MEDIA & GRAPHICS': 'movie',
  OFFICE: 'work',
  'SYSTEM & ADMIN': 'settings',
  'UTILITY & TOOLS': 'build',
};

const CATEGORY_COLOR: Record<string, string> = {
  ALL: 'c-peach',
  DEVELOPMENT: 'c-lavender',
  GAMES: 'c-orange',
  'INTERNET & COMMS': 'c-sky',
  'MEDIA & GRAPHICS': 'c-pink',
  OFFICE: 'c-peach',
  'SYSTEM & ADMIN': 'c-gold',
  'UTILITY & TOOLS': 'c-teal',
};

@Component({
  selector: 'app-apps',
  imports: [Icon],
  templateUrl: './apps.html',
  styleUrl: './apps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppsPage {
  protected readonly store = inject(AppsStore);
  protected readonly icon = (cat: string): IconName => CATEGORY_ICON[cat] ?? 'apps';
  protected readonly color = (cat: string) => CATEGORY_COLOR[cat] ?? 'c-teal';

  protected readonly recent = computed(() => {
    const byId = new Map(this.store.apps().map((a) => [a.id, a]));
    return this.store.recent().flatMap((id) => byId.get(id) ?? []);
  });

  constructor() {
    this.store.ensureLoaded();
  }

  protected launchFirst() {
    const first = this.store.visible()[0];
    if (first) void this.store.launchApp(first);
  }
}
