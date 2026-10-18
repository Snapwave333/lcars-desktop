import { Step } from './catalog';
import { StepOutcome } from './runtime.service';

export interface CardRow {
  label: string;
  detail?: string;
  action?: Step;
}

export type Card = { kind: 'list'; rows: CardRow[]; total: number } | { kind: 'facts'; rows: [string, string][] };

export interface Reply {
  text: string;
  card?: Card;
}

type Obj = Record<string, unknown>;

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const quote = (t: string) => `“${t}”`;

const ALERT_TEXT: Record<string, string> = {
  red: 'Red alert. All hands to battle stations.',
  yellow: 'Yellow alert.',
  blue: 'Blue alert.',
  none: 'Alert cleared. Condition green.',
};

export function bytes(n: number): string {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

function label(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b(mb|gb|ms)\b/g, (x) => x.toUpperCase());
}

function facts(data: Obj): [string, string][] {
  return Object.entries(data)
    .filter(([, v]) => v !== '' && v !== null && typeof v !== 'object')
    .map(([k, v]) => {
      if (k === 'uptime_seconds') return ['uptime', duration(Number(v))];
      if (k.endsWith('_mb')) return [label(k.replace(/_mb$/, '')), bytes(Number(v) * 1024 * 1024)];
      if (k.endsWith('_percent')) return [label(k.replace(/_percent$/, '')), `${v}%`];
      return [label(k), s(v)];
    });
}

export function describe(step: Step, out: StepOutcome): Reply {
  if (!out.ok) return { text: `Couldn't ${step.cmd}: ${out.error ?? 'unknown error'}` };
  const d = obj(out.data);
  const a = step.args;
  switch (step.cmd) {
    case 'alert':
      return { text: ALERT_TEXT[s(d['mode'] ?? a['mode'])] ?? `Alert set to ${s(a['mode'])}.` };
    case 'notify':
      return { text: `Posted ${quote(s(a['title']))}.` };
    case 'wait':
      return { text: `Waited ${(Number(d['waited_ms'] ?? a['ms']) / 1000).toFixed(1).replace(/\.0$/, '')}s.` };
    case 'calc':
      return { text: `${s(d['expr'])} = **${s(d['result'])}**` };
    case 'time':
      return { text: `It's ${s(d['time'])}, ${s(d['date'])}.` };
    case 'echo':
      return { text: s(d['text']) };
    case 'copy':
      return { text: 'Copied to clipboard.' };
    case 'web-search':
      return { text: `Searching the web for ${quote(s(d['query']))}.` };
    case 'open':
      return { text: `Opened ${s(a['path'])}.` };
    case 'start-app':
      return { text: `Opened ${s(d['name']) || s(a['name'])}.` };
    case 'launch':
      return { text: `Started ${s(a['path'])}${d['pid'] ? ` (pid ${s(d['pid'])})` : ''}.` };
    case 'reveal':
      return { text: `Revealed ${s(a['path'])}.` };
    case 'screenshot':
      return { text: `Saved screenshot to ${s(d['path'])}.` };
    case 'show':
    case 'hide':
    case 'toggle':
      return { text: d['visible'] ? 'Window shown.' : 'Window hidden.' };
    case 'minimize':
      return { text: 'Minimized.' };
    case 'maximize':
      return { text: d['maximized'] ? 'Maximized.' : 'Restored.' };
    case 'fullscreen':
      return { text: d['fullscreen'] ? 'Fullscreen on.' : 'Fullscreen off.' };
    case 'ping':
      return { text: 'Pong.' };
    case 'auto-start':
      return { text: d['enable'] ? 'LCARS will start on login.' : 'Start on login disabled.' };
    case 'shell':
      return { text: `Windows shell set to ${s(d['set'])}.` };
    case 'list-dir': {
      const items = arr(out.data);
      const where = s(a['path']) || 'Desktop';
      return {
        text: items.length ? `${items.length} item${items.length === 1 ? '' : 's'} in ${where}.` : `${where} is empty.`,
        card: items.length
          ? {
              kind: 'list',
              total: items.length,
              rows: items.map((i) => ({
                label: s(i['name']),
                detail: i['item_type'] === 'folder' ? 'folder' : bytes(Number(i['size_bytes'])) || s(i['item_type']),
                action:
                  i['item_type'] === 'folder'
                    ? { cmd: 'list-dir', args: { path: s(i['path']) } }
                    : { cmd: 'open', args: { path: s(i['path']) } },
              })),
            }
          : undefined,
      };
    }
    case 'installed-apps':
    case 'find-app': {
      const apps = arr(out.data);
      if (!apps.length) return { text: step.cmd === 'find-app' ? `No apps match ${quote(s(a['name']))}.` : 'No apps found.' };
      return {
        text: `${apps.length} app${apps.length === 1 ? '' : 's'}${step.cmd === 'find-app' ? ` matching ${quote(s(a['name']))}` : ' installed'}.`,
        card: {
          kind: 'list',
          total: apps.length,
          rows: apps.map((x) => ({
            label: s(x['name']),
            detail: s(x['category']).toLowerCase(),
            action: { cmd: 'open', args: { path: s(x['path']) } },
          })),
        },
      };
    }
    case 'quick-locations': {
      const locs = arr(out.data);
      return {
        text: 'Quick locations.',
        card: {
          kind: 'list',
          total: locs.length,
          rows: locs.map((l) => ({
            label: s(l['name']).toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
            detail: s(l['path']),
            action: { cmd: 'list-dir', args: { path: s(l['path']) } },
          })),
        },
      };
    }
    case 'help': {
      const cmds = arr(out.data);
      return {
        text: `I can chain any of these ${cmds.length} commands. Say things like “red alert, wait 2s, then clear the alert”.`,
        card: { kind: 'list', total: cmds.length, rows: cmds.map((c) => ({ label: s(c['name']), detail: s(c['summary']) })) },
      };
    }
    case 'info':
    case 'status':
    case 'shell-status':
      return { text: step.cmd === 'info' ? 'System report.' : 'Status.', card: { kind: 'facts', rows: facts(d) } };
    default:
      return { text: `Done: ${step.cmd}.`, card: Object.keys(d).length ? { kind: 'facts', rows: facts(d) } : undefined };
  }
}

export function compose(steps: Step[], outcomes: StepOutcome[]): Reply {
  const replies = outcomes.map((o, i) => describe(steps[i], o));
  const failedAt = outcomes.findIndex((o) => !o.ok);
  const meaningful = replies.filter((r, i) => !(steps[i].cmd === 'wait' && steps.length > 1 && outcomes[i].ok));
  const text = meaningful.map((r) => r.text).join(' ');
  const card = [...replies].reverse().find((r) => r.card)?.card;
  if (failedAt >= 0 && steps.length > 1) {
    const skipped = steps.length - outcomes.length;
    const tail = skipped > 0 ? ` Skipped the remaining ${skipped} step${skipped === 1 ? '' : 's'}.` : '';
    return { text: `${text}${tail}`.trim(), card };
  }
  return { text: text || 'Done.', card };
}
