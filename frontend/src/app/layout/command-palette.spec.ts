import { score } from './command-palette';

describe('command palette scoring', () => {
  it('prefers prefix over infix over subsequence', () => {
    expect(score('TERMINAL', 'term')).toBeGreaterThan(score('WINDOWS TERMINAL', 'term'));
    expect(score('WINDOWS TERMINAL', 'term')).toBeGreaterThan(score('TASK ENERGY RAM', 'term'));
    expect(score('TASK MANAGER', 'xyz')).toBe(0);
    expect(score('ANYTHING', '')).toBe(1);
  });
});
