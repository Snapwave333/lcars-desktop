import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatClock } from '../../core/format';
import { LogStore } from '../../core/log.store';
import type { LogCategory, LogLevel } from '../../core/models';
import { Icon } from '../../shared/icon';
import type { IconName } from '../../shared/icon-data';

type Filter = LogCategory | 'ALL';

const CATEGORY: Record<Filter, { color: string; icon: IconName }> = {
  ALL: { color: 'c-peach', icon: 'list' },
  APPLICATIONS: { color: 'c-teal', icon: 'apps' },
  FILESYSTEM: { color: 'c-gold', icon: 'folder' },
  SYSTEM: { color: 'c-peri', icon: 'developer_board' },
  ALERTS: { color: 'c-red', icon: 'thunderstorm' },
  CONFIG: { color: 'c-lavender', icon: 'settings' },
};

const LEVEL_ICON: Record<LogLevel, IconName> = {
  info: 'info',
  success: 'check_circle',
  warn: 'warning',
  alert: 'dangerous',
};

@Component({
  selector: 'app-activity',
  imports: [Icon],
  templateUrl: './activity.html',
  styleUrl: './activity.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityPage {
  protected readonly log = inject(LogStore);
  protected readonly filter = signal<Filter>('ALL');
  protected readonly query = signal('');
  protected readonly meta = CATEGORY;
  protected readonly levelIcon = LEVEL_ICON;
  protected readonly filters = Object.keys(CATEGORY) as Filter[];
  protected readonly clock = formatClock;

  protected readonly visible = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    return this.log
      .entries()
      .filter((e) => (f === 'ALL' || e.category === f) && (!q || `${e.message} ${e.detail ?? ''}`.toLowerCase().includes(q)));
  });

  constructor() {
    this.log.markSeen();
  }
}
