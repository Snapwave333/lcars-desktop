import { TestBed } from '@angular/core/testing';

import { setupTestBed } from '../testing';
import { FilesStore } from './files.store';
import { SettingsStore } from './settings.store';

describe('FilesStore', () => {
  let store: FilesStore;

  beforeEach(async () => {
    setupTestBed();
    store = TestBed.inject(FilesStore);
    await store.load('');
  });

  it('loads the desktop with folders first', () => {
    const items = store.visible();
    expect(items.length).toBeGreaterThan(0);
    const firstFile = items.findIndex((i) => i.item_type !== 'folder');
    expect(items.slice(firstFile).every((i) => i.item_type !== 'folder')).toBeTrue();
  });

  it('filters by kind and query reactively', () => {
    store.kind.set('shortcut');
    expect(store.visible().every((i) => i.item_type === 'shortcut')).toBeTrue();
    store.kind.set('all');
    store.query.set('warp');
    expect(store.visible().map((i) => i.name)).toEqual(['Warp Field Analysis.xlsx']);
  });

  it('sorts by size and toggles direction', () => {
    store.setSort('size');
    const files = store.visible().filter((i) => i.item_type !== 'folder');
    expect(files[0].size_bytes).toBeGreaterThanOrEqual(files[files.length - 1].size_bytes);
    store.setSort('size');
    const asc = store.visible().filter((i) => i.item_type !== 'folder');
    expect(asc[0].size_bytes).toBeLessThanOrEqual(asc[asc.length - 1].size_bytes);
  });

  it('navigates with back, forward and up history', async () => {
    await store.navigate('C:\\Users\\Picard\\Documents');
    expect(store.path()).toBe('C:\\Users\\Picard\\Documents');
    await store.goUp();
    expect(store.path()).toBe('C:\\Users\\Picard');
    await store.goBack();
    expect(store.path()).toBe('C:\\Users\\Picard\\Documents');
    await store.goForward();
    expect(store.path()).toBe('C:\\Users\\Picard');
  });

  it('reports errors without losing the current listing', async () => {
    const before = store.items().length;
    await store.navigate('Z:\\nowhere');
    expect(store.error()).toContain('not a directory');
    expect(store.items().length).toBe(before);
    expect(store.back().length).toBe(0);
  });

  it('hides hidden entries unless enabled', async () => {
    await store.navigate('C:\\Users\\Picard');
    expect(store.visible().some((i) => i.hidden)).toBeFalse();
    TestBed.inject(SettingsStore).showHidden.set(true);
    expect(store.visible().some((i) => i.hidden)).toBeTrue();
  });
});
