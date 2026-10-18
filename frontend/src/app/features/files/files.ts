import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { FilesStore, type KindFilter, type SortKey } from '../../core/files.store';
import { KIND_META, formatBytes, formatEpoch } from '../../core/format';
import type { FsEntry, ItemKind } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { SystemStore } from '../../core/system.store';
import { Icon } from '../../shared/icon';
import type { IconName } from '../../shared/icon-data';

export const KIND_ICON: Record<ItemKind, IconName> = {
  folder: 'folder',
  shortcut: 'link',
  document: 'description',
  image: 'image',
  script: 'code_blocks',
  executable: 'deployed_code',
  file: 'draft',
};

const KIND_ORDER: ItemKind[] = ['folder', 'shortcut', 'document', 'image', 'script', 'executable', 'file'];

@Component({
  selector: 'app-files',
  imports: [Icon],
  templateUrl: './files.html',
  styleUrl: './files.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPage {
  protected readonly fs = inject(FilesStore);
  protected readonly settings = inject(SettingsStore);
  private readonly system = inject(SystemStore);
  private readonly listEl = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly meta = KIND_META;
  protected readonly icons = KIND_ICON;
  protected readonly formatBytes = formatBytes;
  protected readonly formatEpoch = formatEpoch;
  protected readonly pathDraft = signal('');

  protected readonly chips = computed(() => {
    const counts = this.fs.counts();
    const all = { kind: 'all' as KindFilter, label: 'ALL', icon: 'list' as IconName, color: 'c-peach', count: counts.get('all') ?? 0 };
    return [
      all,
      ...KIND_ORDER.filter((k) => counts.get(k)).map((k) => ({
        kind: k as KindFilter,
        label: KIND_META[k].label,
        icon: KIND_ICON[k],
        color: KIND_META[k].color,
        count: counts.get(k) ?? 0,
      })),
    ];
  });

  protected readonly totals = computed(() => {
    const items = this.fs.visible();
    const bytes = items.reduce((sum, i) => sum + i.size_bytes, 0);
    const folders = items.filter((i) => i.item_type === 'folder').length;
    return { count: items.length, folders, files: items.length - folders, bytes };
  });

  protected readonly columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'NAME' },
    { key: 'type', label: 'TYPE' },
    { key: 'size', label: 'SIZE' },
    { key: 'modified', label: 'MODIFIED' },
  ];

  constructor() {
    this.fs.ensureLoaded();
  }

  protected submitPath() {
    const p = this.pathDraft().trim();
    void this.fs.navigate(p);
  }

  protected select(item: FsEntry) {
    this.fs.selected.set(item);
  }

  protected isSelected(item: FsEntry) {
    return this.fs.selected()?.path === item.path;
  }

  protected async copy(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      this.system.pushToast({ title: 'PATH COPIED', body: path }, 'success', 2500);
    } catch {
      this.system.pushToast({ title: 'CLIPBOARD UNAVAILABLE', body: path }, 'info', 3000);
    }
  }

  protected onListKey(e: KeyboardEvent) {
    const items = this.fs.visible();
    if (!items.length) return;
    const cur = this.fs.selected();
    const idx = cur ? items.findIndex((i) => i.path === cur.path) : -1;
    const cols = this.settings.view() === 'grid' ? this.gridColumns() : 1;
    let next = idx;
    switch (e.key) {
      case 'ArrowDown':
        next = Math.min(items.length - 1, idx + cols);
        break;
      case 'ArrowUp':
        next = Math.max(0, idx - cols);
        break;
      case 'ArrowRight':
        if (cols > 1) next = Math.min(items.length - 1, idx + 1);
        break;
      case 'ArrowLeft':
        if (cols > 1) next = Math.max(0, idx - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Enter':
        if (cur) void this.fs.activate(cur);
        e.preventDefault();
        return;
      case 'Backspace':
        void this.fs.goUp();
        e.preventDefault();
        return;
      default:
        return;
    }
    e.preventDefault();
    this.fs.selected.set(items[Math.max(0, next)]);
    queueMicrotask(() => this.listEl()?.nativeElement.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }));
  }

  private gridColumns() {
    const el = this.listEl()?.nativeElement;
    const first = el?.querySelector<HTMLElement>('.tile');
    if (!el || !first) return 1;
    return Math.max(1, Math.round(el.clientWidth / (first.offsetWidth + 10)));
  }
}
