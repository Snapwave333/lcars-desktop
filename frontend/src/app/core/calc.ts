export function evaluate(expr: string): number {
  const src = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^');
  let pos = 0;

  const peek = () => src[pos];
  const fail = (msg: string): never => {
    throw new Error(`${msg} at position ${pos + 1}`);
  };

  const number = (): number => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(pos));
    if (!m) return fail('expected a number');
    pos += m[0].length;
    return parseFloat(m[0]);
  };

  const atom = (): number => {
    const c = peek();
    if (c === '(') {
      pos++;
      const v = sum();
      if (peek() !== ')') fail('missing )');
      pos++;
      return v;
    }
    if (c === '-') {
      pos++;
      return -atom();
    }
    if (c === '+') {
      pos++;
      return atom();
    }
    let v = number();
    if (peek() === '%') {
      pos++;
      v /= 100;
    }
    return v;
  };

  const power = (): number => {
    const base = atom();
    if (peek() === '^') {
      pos++;
      return Math.pow(base, power());
    }
    return base;
  };

  const product = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const rhs = power();
      if (op === '/' && rhs === 0) fail('division by zero');
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  };

  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const rhs = product();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  };

  if (!src) fail('empty expression');
  const result = sum();
  if (pos < src.length) fail(`unexpected '${src[pos]}'`);
  return Math.round(result * 1e10) / 1e10;
}
