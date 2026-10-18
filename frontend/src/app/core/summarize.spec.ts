import { compose, describe as describeStep } from './summarize';

describe('summarize', () => {
  it('turns results into short sentences', () => {
    expect(describeStep({ cmd: 'alert', args: { mode: 'red' } }, { ok: true, data: { mode: 'red' }, ms: 1 }).text).toContain('Red alert');
    expect(describeStep({ cmd: 'calc', args: {} }, { ok: true, data: { expr: '2+2', result: 4 }, ms: 1 }).text).toBe('2+2 = **4**');
  });

  it('builds clickable list cards for folders', () => {
    const r = describeStep(
      { cmd: 'list-dir', args: {} },
      { ok: true, ms: 1, data: [{ name: 'Docs', path: 'C:\\Docs', item_type: 'folder', size_bytes: 0 }, { name: 'a.txt', path: 'C:\\a.txt', item_type: 'document', size_bytes: 2048 }] }
    );
    expect(r.text).toBe('2 items in Desktop.');
    expect(r.card?.kind).toBe('list');
    if (r.card?.kind === 'list') {
      expect(r.card.rows[0].action).toEqual({ cmd: 'list-dir', args: { path: 'C:\\Docs' } });
      expect(r.card.rows[1].detail).toBe('2.0 KB');
    }
  });

  it('hides waits and reports skipped steps in multi-step replies', () => {
    const steps = [
      { cmd: 'alert', args: { mode: 'red' } },
      { cmd: 'wait', args: { ms: 1000 } },
      { cmd: 'notify', args: { title: 'x' } },
      { cmd: 'alert', args: { mode: 'none' } },
    ];
    const ok = compose(steps, [
      { ok: true, data: { mode: 'red' }, ms: 1 },
      { ok: true, data: { waited_ms: 1000 }, ms: 1000 },
      { ok: false, error: 'boom', ms: 1 },
    ]);
    expect(ok.text).not.toContain('Waited');
    expect(ok.text).toContain("Couldn't notify: boom");
    expect(ok.text).toContain('Skipped the remaining 1 step.');
  });
});
