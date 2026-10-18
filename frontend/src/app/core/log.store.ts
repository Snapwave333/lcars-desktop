import { Injectable, computed, signal } from '@angular/core';
import type { LogCategory, LogEntry, LogLevel } from './models';

const LIMIT = 250;

@Injectable({ providedIn: 'root' })
export class LogStore {
  private seq = 0;
  readonly entries = signal<LogEntry[]>([]);
  readonly unseenAlerts = signal(0);
  readonly counts = computed(() => {
    const counts: Record<LogCategory | 'ALL', number> = { ALL: 0, APPLICATIONS: 0, FILESYSTEM: 0, SYSTEM: 0, ALERTS: 0, CONFIG: 0 };
    for (const e of this.entries()) {
      counts.ALL++;
      counts[e.category]++;
    }
    return counts;
  });

  add(category: LogCategory, message: string, level: LogLevel = 'info', detail?: string) {
    const entry: LogEntry = { id: ++this.seq, at: new Date(), category, level, message, detail };
    this.entries.update((list) => [entry, ...list].slice(0, LIMIT));
    if (level === 'alert') this.unseenAlerts.update((n) => n + 1);
  }

  markSeen() {
    this.unseenAlerts.set(0);
  }

  clear() {
    this.entries.set([]);
    this.unseenAlerts.set(0);
    this.add('SYSTEM', 'Activity log cleared');
  }
}
