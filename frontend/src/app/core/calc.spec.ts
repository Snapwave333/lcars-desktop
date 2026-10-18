import { evaluate } from './calc';

describe('calc', () => {
  it('respects precedence and parentheses', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('-(4 - 6) * 2')).toBe(4);
  });

  it('handles percentages, decimals and symbols', () => {
    expect(evaluate('(2450 * 18%) + 12')).toBe(453);
    expect(evaluate('0.1 + 0.2')).toBe(0.3);
    expect(evaluate('6 × 7 ÷ 2')).toBe(21);
  });

  it('rejects bad input', () => {
    expect(() => evaluate('')).toThrow();
    expect(() => evaluate('2 +')).toThrow();
    expect(() => evaluate('1 / 0')).toThrowError(/division by zero/);
    expect(() => evaluate('alert(1)')).toThrow();
  });
});
