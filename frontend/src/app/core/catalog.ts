export const DEFAULT_MODEL = 'claude-opus-5-5';

export type ArgKind = 'string' | 'bool' | 'number' | 'list';
export type Surface = 'desktop' | 'browser';

export interface ArgSpec {
  name: string;
  kind: ArgKind;
  required: boolean;
  help: string;
}

export interface CommandSpec {
  name: string;
  plugin: string;
  aliases: string[];
  summary: string;
  args: ArgSpec[];
  client?: boolean;
}

export interface Step {
  cmd: string;
  args: Record<string, unknown>;
}

const a = (name: string, kind: ArgKind, required: boolean, help: string): ArgSpec => ({
  name,
  kind,
  required,
  help,
});

export const CLIENT_COMMANDS: CommandSpec[] = [
  { name: 'calc', plugin: 'assistant', aliases: ['calculate'], summary: 'Evaluate an arithmetic expression', args: [a('expr', 'string', true, 'Expression such as (2+3)*4')], client: true },
  { name: 'time', plugin: 'assistant', aliases: ['date', 'now'], summary: 'Current local date and time', args: [], client: true },
  { name: 'web-search', plugin: 'assistant', aliases: ['search', 'google'], summary: 'Search the web in the default browser', args: [a('query', 'string', true, 'Search terms')], client: true },
  { name: 'copy', plugin: 'assistant', aliases: ['clipboard'], summary: 'Copy text to the clipboard', args: [a('text', 'string', true, 'Text to copy')], client: true },
  { name: 'echo', plugin: 'assistant', aliases: ['say'], summary: 'Reply with the given text', args: [a('text', 'string', true, 'Text')], client: true },
];

export const BROWSER_COMMANDS: CommandSpec[] = [
  { name: 'status', plugin: 'core', aliases: [], summary: 'Runtime status', args: [] },
  { name: 'ping', plugin: 'core', aliases: [], summary: 'Round-trip check', args: [] },
  { name: 'help', plugin: 'core', aliases: ['commands'], summary: 'List every available command', args: [] },
  { name: 'wait', plugin: 'core', aliases: ['sleep'], summary: 'Pause between steps', args: [a('ms', 'number', true, 'Milliseconds to wait (max 60000)')] },
  { name: 'info', plugin: 'system', aliases: ['system-info'], summary: 'Browser and device details', args: [] },
  { name: 'alert', plugin: 'system', aliases: [], summary: 'Set the alert condition', args: [a('mode', 'string', true, 'red | yellow | blue | none')] },
  { name: 'notify', plugin: 'system', aliases: [], summary: 'Post a notification', args: [a('title', 'string', true, 'Notification title'), a('body', 'string', false, 'Notification body')] },
  { name: 'open', plugin: 'files', aliases: [], summary: 'Open a URL in a new tab', args: [a('path', 'string', true, 'URL')] },
];

export function resolve(catalog: CommandSpec[], name: string): CommandSpec | undefined {
  const key = name.trim().toLowerCase().replace(/^\//, '');
  return catalog.find((c) => c.name === key || c.aliases.includes(key));
}

export function mergeCatalogs(...lists: CommandSpec[][]): CommandSpec[] {
  const out = new Map<string, CommandSpec>();
  for (const list of lists) {
    for (const c of list) {
      if (!out.has(c.name)) out.set(c.name, c);
    }
  }
  return [...out.values()];
}

export function missingArgs(spec: CommandSpec, args: Record<string, unknown>): ArgSpec[] {
  return spec.args.filter((x) => x.required && (args[x.name] === undefined || args[x.name] === null || args[x.name] === ''));
}

export function coerce(kind: ArgKind | undefined, raw: string): unknown {
  if (kind === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (kind === 'bool') {
    const v = raw.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    return raw;
  }
  if (kind === 'list') return raw.split(/\s+/).filter(Boolean);
  return raw;
}

export function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function parseCli(catalog: CommandSpec[], input: string): Step | null {
  const tokens = tokenize(input.trim().replace(/^\//, ''));
  if (!tokens.length) return null;
  const spec = resolve(catalog, tokens[0]);
  if (!spec) return null;
  const args: Record<string, unknown> = {};
  const positional: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('--')) {
      positional.push(t);
      continue;
    }
    const body = t.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      const key = body.slice(0, eq);
      args[key] = coerce(spec.args.find((x) => x.name === key)?.kind, body.slice(eq + 1));
    } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
      args[body] = coerce(spec.args.find((x) => x.name === body)?.kind, tokens[++i]);
    } else {
      args[body] = true;
    }
  }
  const free = spec.args.filter((x) => !(x.name in args));
  free.forEach((x, idx) => {
    if (!positional.length) return;
    const absorb = x.kind === 'list' || idx === free.length - 1;
    const values = absorb ? positional.splice(0) : positional.splice(0, 1);
    args[x.name] = x.kind === 'list' ? values : coerce(x.kind, values.join(' '));
  });
  return { cmd: spec.name, args };
}
