import { CommandSpec, Step, parseCli, resolve } from './catalog';

export interface Plan {
  steps: Step[];
  unmatched: string[];
}

type Rule = [RegExp, (m: RegExpMatchArray, surface: PlanSurface) => Step | null];

export interface PlanSurface {
  desktop: boolean;
}

const HARD_SPLIT =
  /\s*(?:\n+|;|&&|,?\s*\band then\b|,?\s*\bthen\b|,?\s*\bafter that\b|,?\s*\bafterwards\b|,?\s*\bfinally\b,?)\s*/i;

const FILLER = [
  /^(hey|hi|ok|okay|yo)[,!\s]+/i,
  /^(please|pls|kindly)\s+/i,
  /^(can|could|would|will) you\s+(please\s+)?/i,
  /^i (want|need|would like) (you )?to\s+/i,
  /^(go ahead and|now|also|first|second|third|lastly|and)\s+/i,
  /^\d+[.)]\s+/,
  /^[-*•]\s+/,
];

const TRAILING = [/[.!?]+$/, /\s+(please|for me|thanks|thank you)$/i, /\s+(now|right now|asap)$/i];

const WAIT_UNITS: Record<string, number> = { ms: 1, millisecond: 1, milliseconds: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000 };

const ALERT_WORDS: Record<string, string> = { red: 'red', yellow: 'yellow', amber: 'yellow', blue: 'blue', green: 'none', none: 'none', normal: 'none', off: 'none', clear: 'none' };

const FOLDERS = ['desktop', 'downloads', 'documents', 'pictures', 'music', 'videos'];

const looksLikeUrl = (s: string) => /^(https?:\/\/\S+|www\.\S+|[\w-]+(\.[\w-]+)*\.(com|org|net|io|dev|ai|app|edu|gov|co|uk|de|tv|me|gg)(\/\S*)?)$/i.test(s);
const looksLikePath = (s: string) => /^([a-z]:[\\/]?|~|\.{1,2}[\\/]|[\\/])/i.test(s) || /[\\/]/.test(s);
const withScheme = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const unquote = (s: string) => s.trim().replace(/^["'“‘](.*)["'”’]$/, '$1').trim();
const folderPath = (name: string) => (name.toLowerCase() === 'desktop' ? '' : `~/${name[0].toUpperCase()}${name.slice(1).toLowerCase()}`);

const RULES: Rule[] = [
  [/^(?:help|commands|what can you do|what can i do|show commands)\??$/i, () => ({ cmd: 'help', args: {} })],
  [/^(?:ping)$/i, () => ({ cmd: 'ping', args: {} })],
  [/^(red|yellow|amber|blue) alert$/i, (m) => ({ cmd: 'alert', args: { mode: ALERT_WORDS[m[1].toLowerCase()] } })],
  [/^(?:set |go to |raise |switch to |change )?(?:the )?(?:alert|condition)(?: level| mode)?(?: to)? (red|yellow|amber|blue|green|none|normal|off|clear)$/i, (m) => ({ cmd: 'alert', args: { mode: ALERT_WORDS[m[1].toLowerCase()] } })],
  [/^(?:go to |set )?condition (red|yellow|green|blue)$/i, (m) => ({ cmd: 'alert', args: { mode: ALERT_WORDS[m[1].toLowerCase()] } })],
  [/^(?:cancel|clear|stop|end|stand down)(?: the| from)? (?:red |yellow |blue )?alert$/i, () => ({ cmd: 'alert', args: { mode: 'none' } })],
  [/^(?:stand down|all clear|at ease|condition green|resume normal operations)$/i, () => ({ cmd: 'alert', args: { mode: 'none' } })],
  [/^(?:wait|pause|sleep|hold on|delay)(?: for)? (\d+(?:\.\d+)?)\s*([a-z]+)?$/i, (m) => {
    const unit = (m[2] ?? 's').toLowerCase();
    const factor = WAIT_UNITS[unit];
    return factor ? { cmd: 'wait', args: { ms: Math.min(60000, Math.round(parseFloat(m[1]) * factor)) } } : null;
  }],
  [/^(?:wait|pause)(?: a)?(?: (?:bit|moment|second|sec))?$/i, () => ({ cmd: 'wait', args: { ms: 1000 } })],
  [/^(?:send|post|show|push)(?: me)?(?: a| an)? (?:notification|notice|message|toast)(?: (?:saying|that says|with|that|about|:))?:?\s+(.+)$/i, (m) => notify(m[1])],
  [/^(?:notify(?: me)?|announce|broadcast|remind me)(?: (?:that|about|to|with))?:?\s+(.+)$/i, (m) => notify(m[1])],
  [/^(?:what(?:'s| is) the time|what time is it|current time|time|date|today|what(?:'s| is) (?:the date|today(?:'s date)?)|what day is it)\??$/i, () => ({ cmd: 'time', args: {} })],
  [/^(?:calc(?:ulate)?|compute|evaluate|what(?:'s| is)|how much is)\s+([-+*/^%().\d\s×÷]+)\??$/i, (m) => /\d/.test(m[1]) ? { cmd: 'calc', args: { expr: m[1].trim() } } : null],
  [/^([-+*/^%().\d\s×÷]*\d[-+*/^%().\d\s×÷]*[-+*/^%×÷][-+*/^%().\d\s×÷]*)=?\??$/i, (m) => ({ cmd: 'calc', args: { expr: m[1].trim() } })],
  [/^copy (.+?)(?: to (?:the |my )?clipboard)?$/i, (m) => ({ cmd: 'copy', args: { text: unquote(m[1]) } })],
  [/^(?:say|echo|repeat)\s+(.+)$/i, (m) => ({ cmd: 'echo', args: { text: unquote(m[1]) } })],
  [/^(?:search|google|look up|lookup|search the web for|search for|web search(?: for)?|find online)\s+(.+)$/i, (m) => ({ cmd: 'web-search', args: { query: unquote(m[1]) } })],
  [/^(?:find|search for|locate|look for)(?: the)? (?:app|application|program)s?(?: (?:called|named))? (.+)$/i, (m) => ({ cmd: 'find-app', args: { name: unquote(m[1]) } })],
  [/^(?:list|show)(?: me)?(?: (?:all|my|the))?(?: installed)? (?:apps|applications|programs)$/i, () => ({ cmd: 'installed-apps', args: {} })],
  [/^(?:list|show|display|what(?:'s| is) (?:on|in))(?: me)?(?: (?:my|the))? (desktop|downloads|documents|pictures|music|videos)(?: (?:folder|files|items|contents))?$/i, (m) => ({ cmd: 'list-dir', args: { path: folderPath(m[1]) } })],
  [/^(?:list|show|ls|dir|browse)(?: me)?(?: (?:files|contents|what's) (?:in|of))?(?: (?:the|my))?(?: folder)?\s+(.+)$/i, (m) => {
    const p = unquote(m[1]);
    return looksLikePath(p) ? { cmd: 'list-dir', args: { path: p } } : null;
  }],
  [/^(?:show|list)(?: me)? (?:my |the )?(?:quick locations|folders|places)$/i, () => ({ cmd: 'quick-locations', args: {} })],
  [/^(?:open|visit|go to|browse to|navigate to|load)\s+(.+)$/i, (m, s) => openTarget(unquote(m[1]), s)],
  [/^(?:launch|start|run|fire up|boot up|bring up)\s+(.+)$/i, (m, s) => openTarget(unquote(m[1]), s, true)],
  [/^reveal\s+(.+)$/i, (m) => ({ cmd: 'reveal', args: { path: unquote(m[1]) } })],
  [/^(?:take|grab|capture|save)(?: a)? screenshot(?: (?:to|as|at|in))?\s+(.+\.png)$/i, (m) => ({ cmd: 'screenshot', args: { path: unquote(m[1]) } })],
  [/^(hide|show|minimize|maximize|toggle)(?: the)?(?: (?:window|shell|app|lcars))?$/i, (m) => ({ cmd: m[1].toLowerCase(), args: {} })],
  [/^(?:go |toggle |enter |exit )?full ?screen(?: mode)?$/i, () => ({ cmd: 'fullscreen', args: {} })],
  [/^(?:system|device|machine|computer|host)? ?(?:info|information|status|diagnostics|telemetry|health|stats|report)$/i, () => ({ cmd: 'info', args: {} })],
  [/^how(?:'s| is) (?:the |my )?(?:system|computer|pc|machine|memory)(?: doing)?\??$/i, () => ({ cmd: 'info', args: {} })],
  [/^(?:enable|turn on) (?:auto-?start|start on (?:boot|login))$/i, () => ({ cmd: 'auto-start', args: { enable: true } })],
  [/^(?:disable|turn off) (?:auto-?start|start on (?:boot|login))$/i, () => ({ cmd: 'auto-start', args: { enable: false } })],
];

function notify(text: string): Step {
  const clean = unquote(text);
  const split = clean.match(/^(.{1,60}?)(?::\s+|\s+-\s+)(.+)$/);
  return split ? { cmd: 'notify', args: { title: split[1], body: split[2] } } : { cmd: 'notify', args: { title: clean } };
}

function openTarget(target: string, surface: PlanSurface, preferApp = false): Step | null {
  const t = target.replace(/^(?:the|my)\s+/i, '').trim();
  if (!t) return null;
  if (looksLikeUrl(t)) return { cmd: 'open', args: { path: withScheme(t) } };
  const folder = t.toLowerCase().replace(/\s+folder$/, '');
  if (FOLDERS.includes(folder)) return { cmd: 'list-dir', args: { path: folderPath(folder) } };
  if (looksLikePath(t)) return { cmd: 'open', args: { path: t } };
  if (/\.(exe|bat|cmd|ps1|msc)$/i.test(t)) return { cmd: 'launch', args: { path: t } };
  const name = t.replace(/\s+(?:app|application|program)$/i, '');
  if (!surface.desktop && !preferApp) return { cmd: 'open', args: { path: withScheme(`${name.replace(/\s+/g, '')}.com`) } };
  return { cmd: 'start-app', args: { name } };
}

export function clean(text: string): string {
  let s = text.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    for (const f of FILLER) s = s.replace(f, '');
    for (const t of TRAILING) s = s.replace(t, '');
    s = s.trim();
  }
  return s;
}

export function parseStep(text: string, catalog: CommandSpec[], surface: PlanSurface): Step | null {
  const s = clean(text);
  if (!s) return null;
  if (s.startsWith('/') || /\s--\w/.test(s)) {
    return parseCli(catalog, s);
  }
  for (const [re, build] of RULES) {
    const m = s.match(re);
    if (m) {
      const step = build(m, surface);
      if (step && resolve(catalog, step.cmd)) return step;
    }
  }
  const first = s.split(/\s+/)[0];
  return resolve(catalog, first) ? parseCli(catalog, s) : null;
}

export function splitSteps(text: string): string[] {
  return text
    .split(HARD_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p && !/^(and|then|,)$/i.test(p));
}

export function plan(text: string, catalog: CommandSpec[], surface: PlanSurface): Plan {
  const steps: Step[] = [];
  const unmatched: string[] = [];
  for (const chunk of splitSteps(text)) {
    const parts = chunk.split(/\s*(?:,\s*and\s+|\s+and\s+|,\s+)\s*/i).filter(Boolean);
    const parsed = parts.length > 1 ? parts.map((p) => parseStep(p, catalog, surface)) : [];
    if (parsed.length && parsed.every((p): p is Step => p !== null)) {
      steps.push(...parsed);
      continue;
    }
    const direct = parseStep(chunk, catalog, surface);
    if (direct) steps.push(direct);
    else unmatched.push(chunk);
  }
  return { steps, unmatched };
}
