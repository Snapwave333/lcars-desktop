import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { App } from './app';
import { SystemStore } from './core/system.store';
import { settle, setupTestBed } from './testing';

describe('App shell', () => {
  beforeEach(() => setupTestBed([App]));

  it('renders the LCARS frame with all subsystems', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/files');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('FILE SYSTEMS');
    expect(el.querySelectorAll('.nav-blk').length).toBe(6);
  });

  it('switches subsystem with number keys', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/files');
    await fixture.whenStable();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    await settle(50);
    await fixture.whenStable();
    expect(router.url).toBe('/sensors');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('SENSOR ARRAY');
  });

  it('reflects the alert condition on the host element', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await TestBed.inject(SystemStore).setAlert('red');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-alert')).toBe('red');
    expect(host.querySelector('.alert-banner')?.textContent).toContain('RED ALERT');
  });

  it('opens the command palette with Ctrl+K', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-command-palette')).not.toBeNull();
  });
});
