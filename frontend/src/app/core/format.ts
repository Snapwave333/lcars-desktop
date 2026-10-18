import type { ItemKind } from './models';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatMegabytes(mb: number): string {
  return formatBytes(mb * 1024 * 1024);
}

export function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}D ${hms}` : hms;
}

export function formatEpoch(epoch: number): string {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function stardate(d: Date): string {
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const yearEnd = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  const frac = (d.getTime() - yearStart) / (yearEnd - yearStart);
  const value = 1000 * (d.getUTCFullYear() - 1985) + 1000 * frac;
  return value.toFixed(1);
}

export function splitArgs(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

export function joinPath(base: string, part: string): string {
  return base.endsWith('\\') || base.endsWith('/') ? `${base}${part}` : `${base}\\${part}`;
}

export interface Crumb {
  label: string;
  path: string;
}

export function breadcrumbs(path: string): Crumb[] {
  const root: Crumb = { label: 'DESKTOP', path: '' };
  const clean = path.trim().replace(/[\\/]+$/, '');
  if (!clean) return [root];
  const parts = clean.split(/[\\/]+/).filter(Boolean);
  const crumbs: Crumb[] = [root];
  let acc = clean.startsWith('/') ? '/' : '';
  parts.forEach((part, i) => {
    acc = i === 0 && part.endsWith(':') ? `${part}\\` : acc ? joinPath(acc, part) : part;
    crumbs.push({ label: part.toUpperCase(), path: acc });
  });
  return crumbs;
}

export function parentPath(path: string): string {
  const crumbs = breadcrumbs(path);
  return crumbs.length > 2 ? crumbs[crumbs.length - 2].path : '';
}

export const KIND_META: Record<ItemKind, { color: string; code: string; label: string }> = {
  folder: { color: 'c-gold', code: 'DIR', label: 'FOLDERS' },
  shortcut: { color: 'c-sky', code: 'LNK', label: 'SHORTCUTS' },
  document: { color: 'c-lavender', code: 'DOC', label: 'DOCUMENTS' },
  image: { color: 'c-teal', code: 'IMG', label: 'MEDIA' },
  script: { color: 'c-orange', code: 'SCR', label: 'SCRIPTS' },
  executable: { color: 'c-peach', code: 'EXE', label: 'BINARIES' },
  file: { color: 'c-peri', code: 'DAT', label: 'DATA' },
};

export function lcarsCode(seed: string, digits = 4): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return String(Math.abs(h) % 10 ** digits).padStart(digits, '0');
}
