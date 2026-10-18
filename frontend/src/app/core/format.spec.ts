import { breadcrumbs, formatBytes, formatUptime, lcarsCode, parentPath, splitArgs, stardate } from './format';

describe('format', () => {
  it('formats byte sizes with sensible precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(734_003_200)).toBe('700 MB');
    expect(formatBytes(2_147_483_648)).toBe('2.0 GB');
  });

  it('formats uptime with optional days', () => {
    expect(formatUptime(3665)).toBe('01:01:05');
    expect(formatUptime(90061)).toBe('1D 01:01:01');
  });

  it('splits arguments respecting quotes', () => {
    expect(splitArgs('-a "b c" \'d e\' f')).toEqual(['-a', 'b c', 'd e', 'f']);
    expect(splitArgs('  ')).toEqual([]);
    expect(splitArgs('""')).toEqual(['']);
  });

  it('builds windows breadcrumbs and parents', () => {
    expect(breadcrumbs('')).toEqual([{ label: 'DESKTOP', path: '' }]);
    expect(breadcrumbs('C:\\Users\\Picard').map((c) => c.path)).toEqual(['', 'C:\\', 'C:\\Users', 'C:\\Users\\Picard']);
    expect(parentPath('C:\\Users\\Picard')).toBe('C:\\Users');
    expect(parentPath('C:\\Users')).toBe('C:\\');
    expect(parentPath('C:\\')).toBe('');
  });

  it('produces stable stardates and codes', () => {
    expect(stardate(new Date(Date.UTC(2026, 0, 1)))).toBe('41000.0');
    expect(lcarsCode('alpha')).toBe(lcarsCode('alpha'));
    expect(lcarsCode('alpha')).toMatch(/^\d{4}$/);
  });
});
