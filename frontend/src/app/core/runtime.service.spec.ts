import { TestBed } from '@angular/core/testing';

import { RuntimeService, ShellEvent } from './runtime.service';

describe('RuntimeService (browser)', () => {
  let rt: RuntimeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    rt = TestBed.inject(RuntimeService);
  });

  it('runs in browser mode without Tauri', () => {
    expect(rt.surface()).toBe('browser');
  });

  it('executes client commands', async () => {
    const out = await rt.run({ cmd: 'calc', args: { expr: '6*7' } });
    expect(out.ok).toBeTrue();
    expect(out.data).toEqual({ expr: '6*7', result: 42 });
  });

  it('emits alert and notify events', async () => {
    const seen: ShellEvent[] = [];
    rt.onEvent((e) => seen.push(e));
    await rt.run({ cmd: 'alert', args: { mode: 'red' } });
    await rt.run({ cmd: 'notify', args: { title: 'Hi' } });
    expect(rt.alert()).toBe('red');
    expect(seen.map((e) => e.kind)).toEqual(['alert', 'notify']);
  });

  it('validates arguments and unknown commands', async () => {
    expect((await rt.run({ cmd: 'notify', args: {} })).error).toContain('title');
    expect((await rt.run({ cmd: 'alert', args: { mode: 'purple' } })).ok).toBeFalse();
    expect((await rt.run({ cmd: 'warp', args: {} })).error).toContain('unknown');
  });

  it('refuses local paths in the browser', async () => {
    const out = await rt.run({ cmd: 'open', args: { path: 'C:\\x' } });
    expect(out.ok).toBeFalse();
    expect(out.error).toContain('desktop app');
  });

  it('cancels waits', async () => {
    const ctl = new AbortController();
    const pending = rt.run({ cmd: 'wait', args: { ms: 5000 } }, ctl.signal);
    ctl.abort();
    const out = await pending;
    expect(out.ok).toBeFalse();
    expect(out.error).toBe('cancelled');
  });
});
