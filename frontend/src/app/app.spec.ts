import { TestBed } from '@angular/core/testing';

import { App, rich } from './app';
import { AgentService } from './core/agent.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('renders the empty state with suggestions', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('What should I do?');
    expect(el.querySelectorAll('.chip').length).toBe(4);
  });

  it('runs a multi-step request end to end in the browser and hides the trace', async () => {
    const fixture = TestBed.createComponent(App);
    const agent = TestBed.inject(AgentService);
    await agent.send('red alert then calculate 6*7 then stand down');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const reply = agent.messages().at(-1)!;
    expect(reply.steps.map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(reply.text).toContain('= **42**');
    expect(el.querySelector('.trace')?.textContent).toContain('3 steps');
    expect(el.querySelector('.steps')).toBeNull();
    (el.querySelector('.trace') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.steps li').length).toBe(3);
  });

  it('does not echo its own notifications but shows external ones', async () => {
    const agent = TestBed.inject(AgentService);
    await agent.send('notify Hello');
    expect(agent.messages().filter((m) => m.role === 'event').length).toBe(0);
    await agent.runtime.run({ cmd: 'notify', args: { title: 'From CLI' } });
    expect(agent.messages().at(-1)?.role).toBe('event');
  });

  it('explains unknown requests when no API key is set', async () => {
    const agent = TestBed.inject(AgentService);
    await agent.send('compose a symphony');
    const reply = agent.messages().at(-1)!;
    expect(reply.state).toBe('error');
    expect(reply.text).toContain('help');
  });

  it('shows matching commands for slash input', () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.onInput('/al');
    fixture.detectChanges();
    const names = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.palette .name')).map((n) => n.textContent);
    expect(names).toContain('/alert');
  });

  it('escapes html in rich text', () => {
    expect(rich('<b>x</b> **y** `z`')).toBe('&lt;b&gt;x&lt;/b&gt; <strong>y</strong> <code>z</code>');
  });
});
