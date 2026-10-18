import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ICONS = [
  'add', 'apps', 'arrow_back', 'arrow_downward', 'arrow_forward', 'arrow_upward', 'bolt', 'brush', 'build',
  'calculate', 'chat', 'check_circle', 'chevron_right', 'close', 'code', 'content_copy', 'dangerous',
  'dashboard_customize', 'description', 'desktop_windows', 'developer_board', 'devices', 'download', 'draft',
  'edit_note', 'error', 'event_note', 'folder', 'folder_open', 'grid_view', 'hard_drive', 'history', 'home',
  'image', 'info', 'keyboard', 'link', 'list', 'manage_search', 'memory', 'monitor_heart', 'movie', 'music_note',
  'notifications', 'open_in_new', 'palette', 'person', 'photo_library', 'play_arrow', 'power_settings_new',
  'refresh', 'rocket_launch', 'schedule', 'search', 'settings', 'shield', 'speed', 'sports_esports',
  'storage', 'swap_horiz', 'task_alt', 'terminal', 'timer', 'tune', 'visibility', 'visibility_off',
  'warning', 'web', 'work', 'deployed_code', 'sensors', 'fullscreen', 'minimize',
  'crop_square', 'campaign', 'restart_alt', 'filter_list', 'sort', 'radar', 'thermostat', 'troubleshoot',
];

const require = createRequire(import.meta.url);
const root = join(dirname(require.resolve('@material-symbols/svg-400/package.json')), 'rounded');
const entries = ICONS.map((name) => {
  const svg = readFileSync(join(root, `${name}-fill.svg`), 'utf8');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`no path data for ${name}`);
  return `  ${name}: '${paths.join(' ')}',`;
});

const out = `export const ICONS = {\n${entries.join('\n')}\n} as const;\n\nexport type IconName = keyof typeof ICONS;\n`;
writeFileSync(new URL('../src/app/shared/icon-data.ts', import.meta.url), out);
console.log(`wrote ${ICONS.length} Material Symbols (rounded, filled)`);
