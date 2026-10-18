import { Injectable, computed, inject, signal } from '@angular/core';
import { BACKEND } from './backend';
import { breadcrumbs, parentPath } from './format';
import { LogStore } from './log.store';
import type { FsEntry, ItemKind } from './models';
import { SettingsStore } from './settings.store';
import { errorText } from './system.store';

export type SortKey = 'name' | 'size' | 'modified' | 'type';
export type KindFilter = ItemKind | 'all';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

@Injectable({ providedIn: 'root' })
export class FilesStore {
  private readonly backend = inject(BACKEND);
  private readonly log = inject(LogStore);
  private readonly settings = inject(SettingsStore);
  private requestSeq = 0;

  readonly path = signal('');
  readonly items = signal<FsEntry[]>([]);
  readonly truncated = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly back = signal<string[]>([]);
  readonly forward = signal<string[]>([]);
  readonly query = signal('');
  readonly kind = signal<KindFilter>('all');
  readonly sortKey = signal<SortKey>('name');
  readonly sortAsc = signal(true);
  readonly selected = signal<FsEntry | null>(null);
  private loaded = false;

  readonly crumbs = computed(() => breadcrumbs(this.path()));

  readonly counts = computed(() => {
    const counts = new Map<KindFilter, number>([['all', 0]]);
    for (const item of this.items()) {
      if (item.hidden && !this.settings.showHidden()) continue;
      counts.set('all', (counts.get('all') ?? 0) + 1);
      counts.set(item.item_type, (counts.get(item.item_type) ?? 0) + 1);
    }
    return counts;
  });

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const kind = this.kind();
    const showHidden = this.settings.showHidden();
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    const list = this.items().filter(
      (i) =>
        (showHidden || !i.hidden) &&
        (kind === 'all' || i.item_type === kind) &&
        (!q || i.name.toLowerCase().includes(q) || i.filename.toLowerCase().includes(q)),
    );
    return list.sort((a, b) => {
      const folders = Number(b.item_type === 'folder') - Number(a.item_type === 'folder');
      if (folders) return folders;
      switch (key) {
        case 'size':
          return (a.size_bytes - b.size_bytes) * dir || collator.compare(a.name, b.name);
        case 'modified':
          return (a.modified_epoch - b.modified_epoch) * dir;
        case 'type':
          return collator.compare(a.extension, b.extension) * dir || collator.compare(a.name, b.name);
        default:
          return collator.compare(a.name, b.name) * dir;
      }
    });
  });

  ensureLoaded() {
    if (!this.loaded) {
      this.loaded = true;
      void this.load('');
    }
  }

  async load(path: string): Promise<boolean> {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const listing = await this.backend.listDirectory(path || null);
      if (seq !== this.requestSeq) return false;
      this.path.set(listing.path);
      this.items.set(listing.items);
      this.truncated.set(listing.truncated);
      this.selected.set(null);
      this.kind.set('all');
      return true;
    } catch (err) {
      if (seq !== this.requestSeq) return false;
      const msg = errorText(err);
      this.error.set(msg);
      this.log.add('FILESYSTEM', `Cannot access ${path || 'desktop'}`, 'alert', msg);
      return false;
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }

  async navigate(path: string) {
    const from = this.path();
    if (path === from && this.loaded) {
      await this.refresh();
      return;
    }
    this.loaded = true;
    if (await this.load(path)) {
      this.back.update((b) => [...b, from].slice(-50));
      this.forward.set([]);
      this.query.set('');
    }
  }

  async goBack() {
    const stack = this.back();
    if (!stack.length) return;
    const target = stack[stack.length - 1];
    const from = this.path();
    if (await this.load(target)) {
      this.back.set(stack.slice(0, -1));
      this.forward.update((f) => [...f, from]);
    }
  }

  async goForward() {
    const stack = this.forward();
    if (!stack.length) return;
    const target = stack[stack.length - 1];
    const from = this.path();
    if (await this.load(target)) {
      this.forward.set(stack.slice(0, -1));
      this.back.update((b) => [...b, from]);
    }
  }

  goUp() {
    if (this.path()) return this.navigate(parentPath(this.path()));
    return Promise.resolve();
  }

  refresh() {
    return this.load(this.path());
  }

  setSort(key: SortKey) {
    if (this.sortKey() === key) this.sortAsc.update((v) => !v);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(key === 'name' || key === 'type');
    }
  }

  async activate(item: FsEntry) {
    if (item.item_type === 'folder') return this.navigate(item.path);
    return this.open(item.path);
  }

  async open(path: string) {
    try {
      await this.backend.open(path);
      this.log.add('FILESYSTEM', `Opened ${path}`, 'success');
    } catch (err) {
      this.log.add('FILESYSTEM', `Cannot open ${path}`, 'alert', errorText(err));
    }
  }

  async reveal(path: string) {
    try {
      await this.backend.reveal(path);
      this.log.add('FILESYSTEM', `Revealed ${path} in Explorer`);
    } catch (err) {
      this.log.add('FILESYSTEM', `Cannot reveal ${path}`, 'alert', errorText(err));
    }
  }
}
