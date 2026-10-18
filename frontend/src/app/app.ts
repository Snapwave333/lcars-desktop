import { Component, ElementRef, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';

import { AgentService, ChatMessage, StepView } from './core/agent.service';
import { CommandSpec, DEFAULT_MODEL } from './core/catalog';
import { CardRow } from './core/summarize';

const LIST_PREVIEW = 6;

const SUGGESTIONS = {
  desktop: [
    'Show my desktop',
    'Red alert, wait 2 seconds, then stand down',
    'Open notepad then notify Ready for input',
    'How is the system doing?',
  ],
  browser: [
    'Red alert, wait 2 seconds, then stand down',
    'Calculate (2450 * 18%) + 12',
    'What time is it?',
    'Search the web for LCARS interface design',
  ],
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function rich(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly agent = inject(AgentService);
  protected readonly runtime = this.agent.runtime;
  protected readonly defaultModel = DEFAULT_MODEL;
  protected readonly preview = LIST_PREVIEW;

  readonly draft = signal('');
  readonly settingsOpen = signal(false);
  readonly expandedSteps = signal<ReadonlySet<string>>(new Set());
  readonly expandedCards = signal<ReadonlySet<string>>(new Set());
  readonly paletteIndex = signal(0);
  readonly keyVisible = signal(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  readonly suggestions = computed(() => SUGGESTIONS[this.runtime.surface()]);

  readonly palette = computed<CommandSpec[]>(() => {
    const d = this.draft();
    if (!d.startsWith('/') || /\s/.test(d)) return [];
    const q = d.slice(1).toLowerCase();
    return this.runtime
      .catalog()
      .filter((c) => c.name.startsWith(q) || c.aliases.some((a) => a.startsWith(q)) || (q.length > 1 && c.summary.toLowerCase().includes(q)))
      .slice(0, 7);
  });

  readonly modeLabel = computed(() => {
    const where = this.runtime.surface() === 'desktop' ? 'desktop' : 'browser';
    return this.agent.aiEnabled() ? `${where} · claude` : where;
  });

  constructor() {
    effect(() => {
      this.agent.messages();
      queueMicrotask(() => this.scrollToEnd());
    });
    effect(() => {
      this.palette();
      this.paletteIndex.set(0);
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.settingsOpen()) this.settingsOpen.set(false);
      else if (this.agent.busy()) this.agent.stop();
      else if (this.draft()) this.draft.set('');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.newChat();
    }
  }

  onInputKey(e: KeyboardEvent) {
    const items = this.palette();
    if (items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        this.paletteIndex.set((this.paletteIndex() + dir + items.length) % items.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        this.pickCommand(items[this.paletteIndex()]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.submit();
      return;
    }
    if (e.key === 'ArrowUp' && !this.draft()) {
      const last = [...this.agent.messages()].reverse().find((m) => m.role === 'user');
      if (last) {
        e.preventDefault();
        this.setDraft(last.text);
      }
    }
  }

  onInput(value: string) {
    this.draft.set(value);
    this.autosize();
  }

  pickCommand(c: CommandSpec) {
    this.setDraft(`/${c.name} `);
  }

  submit(text?: string) {
    const value = (text ?? this.draft()).trim();
    if (!value || this.agent.busy()) return;
    this.setDraft('');
    void this.agent.send(value);
  }

  useSuggestion(s: string) {
    this.submit(s);
  }

  act(row: CardRow) {
    if (row.action) void this.agent.runAction(row.action, row.label);
  }

  newChat() {
    this.agent.clear();
    this.expandedSteps.set(new Set());
    this.expandedCards.set(new Set());
    this.focusInput();
  }

  toggle(set: 'steps' | 'cards', id: string) {
    const target = set === 'steps' ? this.expandedSteps : this.expandedCards;
    const next = new Set(target());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    target.set(next);
  }

  stepSummary(m: ChatMessage): string {
    const total = m.steps.length;
    const ms = m.steps.reduce((acc, s) => acc + (s.ms ?? 0), 0);
    const failed = m.steps.filter((s) => s.state === 'error').length;
    const base = `${total} step${total === 1 ? '' : 's'}`;
    const time = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    return failed ? `${base} · ${failed} failed` : `${base} · ${time}`;
  }

  activity(m: ChatMessage): string {
    const i = m.steps.findIndex((s) => s.state === 'running');
    if (i < 0) return m.engine === 'claude' ? 'Thinking' : 'Working';
    const label = this.stepLabel(m.steps[i]);
    return m.steps.length > 1 ? `Step ${i + 1} of ${m.steps.length} · ${label}` : label;
  }

  stepLabel(s: StepView): string {
    const values = Object.values(s.args)
      .filter((v) => v !== '' && v !== undefined && v !== null && typeof v !== 'object')
      .map(String);
    const detail = values.join(' ').slice(0, 60);
    return detail ? `${s.cmd} ${detail}` : s.cmd;
  }

  rich(text: string): string {
    return rich(text);
  }

  private setDraft(v: string) {
    this.draft.set(v);
    const el = this.input()?.nativeElement;
    if (el) el.value = v;
    queueMicrotask(() => {
      this.autosize();
      this.focusInput();
    });
  }

  private focusInput() {
    const el = this.input()?.nativeElement;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  private autosize() {
    const el = this.input()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  private scrollToEnd() {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }
}
