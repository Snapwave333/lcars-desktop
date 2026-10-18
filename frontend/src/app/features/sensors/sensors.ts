import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatMegabytes, formatUptime } from '../../core/format';
import { SystemStore } from '../../core/system.store';
import { Totem } from '../../shared/totem';
import { Icon } from '../../shared/icon';
import { TrendChart, type Series } from '../../shared/trend-chart';

const CELLS = 24;

@Component({
  selector: 'app-sensors',
  imports: [Totem, TrendChart, Icon, DecimalPipe],
  templateUrl: './sensors.html',
  styleUrl: './sensors.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SensorsPage {
  protected readonly system = inject(SystemStore);
  protected readonly t = this.system.telemetry;
  protected readonly formatMegabytes = formatMegabytes;
  protected readonly formatUptime = formatUptime;

  protected readonly series = computed<Series[]>(() => [
    { label: 'CPU', color: 'var(--lc-orange)', values: this.system.cpuHistory() },
    { label: 'MEMORY', color: 'var(--lc-teal)', values: this.system.memHistory() },
  ]);

  protected readonly racks = computed(() => {
    const t = this.t();
    const freeMem = t.total_memory_mb ? (t.available_memory_mb / t.total_memory_mb) * 100 : 0;
    const peak = Math.max(0, ...this.system.cpuHistory());
    return [
      { label: 'CPU', value: t.cpu_load_percent, color: 'c-orange' },
      { label: 'PEAK', value: peak, color: 'c-gold' },
      { label: 'RAM', value: t.memory_load_percent, color: 'c-teal' },
      { label: 'FREE', value: freeMem, color: 'c-peri' },
      { label: 'DISK', value: this.system.diskUsedPercent(), color: 'c-lavender' },
    ].map((r) => ({ ...r, lit: Math.round((Math.max(0, Math.min(100, r.value)) / 100) * CELLS) }));
  });

  protected readonly cells = Array.from({ length: CELLS }, (_, i) => i);
}
