import { BROWSER_COMMANDS, CLIENT_COMMANDS, CommandSpec, mergeCatalogs, parseCli, tokenize } from './catalog';
import { clean, plan, splitSteps } from './planner';

const DESKTOP_ONLY: CommandSpec[] = ['list-dir', 'start-app', 'find-app', 'installed-apps', 'launch', 'reveal', 'screenshot', 'show', 'hide', 'minimize', 'maximize', 'fullscreen', 'toggle', 'quick-locations', 'auto-start'].map((name) => ({
  name,
  plugin: 'test',
  aliases: name === 'list-dir' ? ['ls'] : [],
  summary: name,
  args: [],
}));

const browser = mergeCatalogs(CLIENT_COMMANDS, BROWSER_COMMANDS);
const desktop = mergeCatalogs(browser, DESKTOP_ONLY);
const onDesktop = { desktop: true };
const inBrowser = { desktop: false };

const cmds = (text: string, catalog = desktop, surface = onDesktop) => plan(text, catalog, surface).steps.map((s) => s.cmd);

describe('planner', () => {
  it('splits on natural separators', () => {
    expect(splitSteps('red alert, then wait 2s and then notify done; ping')).toEqual(['red alert', 'wait 2s', 'notify done', 'ping']);
    expect(splitSteps('1. ping\n2. time')).toEqual(['1. ping', '2. time']);
  });

  it('strips politeness', () => {
    expect(clean('Hey, could you please show my desktop for me?')).toBe('show my desktop');
  });

  it('plans a multi-step alert sequence', () => {
    const p = plan('Red alert, wait 2 seconds, then stand down', desktop, onDesktop);
    expect(p.unmatched).toEqual([]);
    expect(p.steps).toEqual([
      { cmd: 'alert', args: { mode: 'red' } },
      { cmd: 'wait', args: { ms: 2000 } },
      { cmd: 'alert', args: { mode: 'none' } },
    ]);
  });

  it('splits on "and" only when every part is a command', () => {
    expect(cmds('open notepad and notify Ready')).toEqual(['start-app', 'notify']);
    expect(plan('notify salt and pepper', desktop, onDesktop).steps).toEqual([{ cmd: 'notify', args: { title: 'salt and pepper' } }]);
  });

  it('maps opening things by target type', () => {
    expect(plan('open github.com', desktop, onDesktop).steps[0]).toEqual({ cmd: 'open', args: { path: 'https://github.com' } });
    expect(plan('open C:\\Users', desktop, onDesktop).steps[0]).toEqual({ cmd: 'open', args: { path: 'C:\\Users' } });
    expect(plan('launch regedit.exe', desktop, onDesktop).steps[0]).toEqual({ cmd: 'launch', args: { path: 'regedit.exe' } });
    expect(plan('open the downloads folder', desktop, onDesktop).steps[0]).toEqual({ cmd: 'list-dir', args: { path: '~/Downloads' } });
    expect(plan('start visual studio code', desktop, onDesktop).steps[0]).toEqual({ cmd: 'start-app', args: { name: 'visual studio code' } });
  });

  it('understands everyday requests', () => {
    expect(cmds('show my desktop')).toEqual(['list-dir']);
    expect(cmds('what time is it?')).toEqual(['time']);
    expect(cmds('how is the system doing?')).toEqual(['info']);
    expect(cmds('search the web for warp drives')).toEqual(['web-search']);
    expect(cmds('list installed apps')).toEqual(['installed-apps']);
    expect(cmds('find app chrome')).toEqual(['find-app']);
    expect(cmds('minimize the window')).toEqual(['minimize']);
    expect(cmds('go fullscreen')).toEqual(['fullscreen']);
    expect(cmds('copy "hello world" to clipboard')).toEqual(['copy']);
    expect(cmds('help')).toEqual(['help']);
  });

  it('parses notifications with title and body', () => {
    expect(plan('send a notification saying Shields: holding at 80%', desktop, onDesktop).steps[0]).toEqual({
      cmd: 'notify',
      args: { title: 'Shields', body: 'holding at 80%' },
    });
  });

  it('handles calculations', () => {
    expect(plan('calculate (2450 * 18%) + 12', desktop, onDesktop).steps[0]).toEqual({ cmd: 'calc', args: { expr: '(2450 * 18%) + 12' } });
    expect(cmds('2+2')).toEqual(['calc']);
  });

  it('caps waits and converts units', () => {
    expect(plan('wait 500ms', desktop, onDesktop).steps[0].args['ms']).toBe(500);
    expect(plan('pause for 5 minutes', desktop, onDesktop).steps[0].args['ms']).toBe(60000);
  });

  it('accepts raw slash and flag syntax', () => {
    expect(plan('/alert --mode yellow', desktop, onDesktop).steps[0]).toEqual({ cmd: 'alert', args: { mode: 'yellow' } });
    expect(plan('/notify "Hull breach" --body "deck 7"', desktop, onDesktop).steps[0]).toEqual({ cmd: 'notify', args: { title: 'Hull breach', body: 'deck 7' } });
    expect(plan('/ls C:\\Temp', desktop, onDesktop).steps[0]).toEqual({ cmd: 'list-dir', args: {} });
  });

  it('reports what it could not understand instead of guessing', () => {
    const p = plan('red alert then make me a sandwich', desktop, onDesktop);
    expect(p.steps.length).toBe(1);
    expect(p.unmatched).toEqual(['make me a sandwich']);
  });

  it('never plans desktop-only commands in the browser', () => {
    const p = plan('show my desktop then red alert', browser, inBrowser);
    expect(p.steps.map((s) => s.cmd)).toEqual(['alert']);
    expect(p.unmatched).toEqual(['show my desktop']);
    expect(plan('open youtube', browser, inBrowser).steps[0]).toEqual({ cmd: 'open', args: { path: 'https://youtube.com' } });
  });
});

describe('catalog cli parsing', () => {
  it('tokenizes quotes', () => {
    expect(tokenize(`notify "a b" 'c d' e`)).toEqual(['notify', 'a b', 'c d', 'e']);
  });

  it('fills positional args and coerces types', () => {
    expect(parseCli(browser, 'wait 250')).toEqual({ cmd: 'wait', args: { ms: 250 } });
    expect(parseCli(browser, 'notify Hello there')).toEqual({ cmd: 'notify', args: { title: 'Hello', body: 'there' } });
    expect(parseCli(browser, 'alert --mode=red')).toEqual({ cmd: 'alert', args: { mode: 'red' } });
    expect(parseCli(browser, 'nope')).toBeNull();
  });
});
