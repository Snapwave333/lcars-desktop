import { TestBed } from '@angular/core/testing';

import { settle, setupTestBed } from '../testing';
import { LogStore } from './log.store';
import { SystemStore } from './system.store';

describe('SystemStore', () => {
  beforeEach(() => setupTestBed());

  it('polls telemetry into history', async () => {
    const store = TestBed.inject(SystemStore);
    await settle(150);
    expect(store.online()).toBeTrue();
    expect(store.telemetry().cpu_cores).toBe(16);
    expect(store.cpuHistory().length).toBeGreaterThan(0);
  });

  it('cycles alert conditions and logs them once', async () => {
    const store = TestBed.inject(SystemStore);
    const log = TestBed.inject(LogStore);
    store.cycleAlert();
    await settle(50);
    expect(store.alert()).toBe('yellow');
    store.cycleAlert();
    await settle(50);
    expect(store.alert()).toBe('red');
    expect(log.entries().filter((e) => e.category === 'ALERTS').length).toBe(2);
    expect(log.unseenAlerts()).toBe(1);
  });

  it('turns backend notifications into toasts', async () => {
    const store = TestBed.inject(SystemStore);
    await settle(20);
    await store.broadcast('HAIL', 'Open channel');
    expect(store.toasts()[0].title).toBe('HAIL');
    store.dismissToast(store.toasts()[0].id);
    expect(store.toasts().length).toBe(0);
  });

  it('toggles auto-start through the backend', async () => {
    const store = TestBed.inject(SystemStore);
    await store.setAutoStart(true);
    expect(store.shellStatus().autostart_enabled).toBeTrue();
  });
});
