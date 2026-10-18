import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { Step } from './catalog';
import { plan } from './planner';
import { RuntimeService, StepOutcome } from './runtime.service';
import { Card, compose, describe } from './summarize';

export type StepState = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface StepView {
  key: string;
  cmd: string;
  args: Record<string, unknown>;
  state: StepState;
  error?: string;
  ms?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'event';
  text: string;
  steps: StepView[];
  card?: Card;
  state: 'running' | 'done' | 'error';
  engine?: 'local' | 'claude';
  at: number;
}

export interface Settings {
  apiKey: string;
  model: string;
}

const STORE_MESSAGES = 'lcars.chat.v1';
const STORE_SETTINGS = 'lcars.settings.v1';
const MAX_KEPT = 200;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORE_MESSAGES);
    const list = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(list) ? list.filter((m) => m.state !== 'running') : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

@Injectable({ providedIn: 'root' })
export class AgentService {
  readonly runtime = inject(RuntimeService);

  readonly messages = signal<ChatMessage[]>(loadMessages());
  readonly settings = signal<Settings>(load<Settings>(STORE_SETTINGS, { apiKey: '', model: '' }));
  readonly busy = computed(() => this.messages().some((m) => m.state === 'running'));
  readonly aiEnabled = computed(() => this.settings().apiKey.trim().length > 0);

  private history: BetaMessageParam[] = [];
  private controller: AbortController | null = null;

  constructor() {
    effect(() => save(STORE_MESSAGES, this.messages().filter((m) => m.state !== 'running').slice(-MAX_KEPT)));
    effect(() => save(STORE_SETTINGS, this.settings()));
    this.runtime.onEvent((e) => {
      if (e.kind === 'notify' && !this.busy()) {
        this.push({ role: 'event', text: e.body ? `**${e.title}** — ${e.body}` : `**${e.title}**`, state: 'done' });
      }
    });
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  clear() {
    this.stop();
    this.history = [];
    this.messages.set([]);
  }

  stop() {
    this.controller?.abort();
    this.controller = null;
  }

  async send(input: string) {
    const text = input.trim();
    if (!text || this.busy()) return;
    this.push({ role: 'user', text, state: 'done' });
    const local = plan(text, this.runtime.catalog(), { desktop: this.runtime.surface() === 'desktop' });
    if (local.steps.length && !local.unmatched.length) {
      await this.runLocal(local.steps);
    } else if (this.aiEnabled()) {
      await this.runClaude(text);
    } else {
      const missing = local.unmatched.map((u) => `“${u}”`).join(', ');
      this.push({
        role: 'assistant',
        engine: 'local',
        state: 'error',
        text: `I couldn’t turn ${missing} into an action. Type **help** to see what I can do, or add a Claude API key in settings for free-form requests.`,
      });
    }
  }

  async runAction(step: Step, label: string) {
    if (this.busy()) return;
    this.push({ role: 'user', text: label, state: 'done' });
    await this.runLocal([step]);
  }

  private async runLocal(steps: Step[]) {
    const controller = new AbortController();
    this.controller = controller;
    const msg = this.push({
      role: 'assistant',
      engine: 'local',
      state: 'running',
      text: '',
      steps: steps.map((s) => ({ key: uid(), cmd: s.cmd, args: s.args, state: 'pending' as StepState })),
    });
    const outcomes: StepOutcome[] = [];
    for (let i = 0; i < steps.length; i++) {
      this.patchStep(msg.id, i, { state: 'running' });
      const outcome = await this.runtime.run(steps[i], controller.signal);
      outcomes.push(outcome);
      this.patchStep(msg.id, i, { state: outcome.ok ? 'done' : 'error', error: outcome.error, ms: outcome.ms });
      if (!outcome.ok) {
        for (let j = i + 1; j < steps.length; j++) this.patchStep(msg.id, j, { state: 'skipped' });
        break;
      }
    }
    const reply = steps.length === 1 ? describe(steps[0], outcomes[0]) : compose(steps, outcomes);
    const failed = outcomes.some((o) => !o.ok);
    this.patch(msg.id, { text: reply.text, card: reply.card, state: failed ? 'error' : 'done' });
    if (this.controller === controller) this.controller = null;
  }

  private async runClaude(prompt: string) {
    const controller = new AbortController();
    this.controller = controller;
    const msg = this.push({ role: 'assistant', engine: 'claude', state: 'running', text: '' });
    const index = new Map<string, number>();
    let lastCard: Card | undefined;
    try {
      const { runAgent } = await import('./claude');
      const result = await runAgent({
        apiKey: this.settings().apiKey.trim(),
        model: this.settings().model.trim(),
        history: this.history,
        prompt,
        catalog: this.runtime.catalog(),
        surface: this.runtime.surface(),
        signal: controller.signal,
        exec: (step) => this.runtime.run(step, controller.signal),
        hooks: {
          text: (delta) => this.patch(msg.id, { text: this.find(msg.id).text + delta }),
          toolStart: (id, step) => {
            const steps = this.find(msg.id).steps;
            index.set(id, steps.length);
            this.patch(msg.id, { steps: [...steps, { key: id, cmd: step.cmd, args: step.args, state: 'running' }] });
          },
          toolEnd: (id, outcome) => {
            const i = index.get(id) ?? -1;
            const step = this.find(msg.id).steps[i];
            if (step) {
              const card = describe({ cmd: step.cmd, args: step.args }, outcome).card;
              if (card) lastCard = card;
            }
            this.patchStep(msg.id, i, { state: outcome.ok ? 'done' : 'error', error: outcome.error, ms: outcome.ms });
          },
        },
      });
      this.history = result.history;
      this.patch(msg.id, { state: 'done', card: lastCard, text: result.text.trim() || 'Done.' });
    } catch (err) {
      const { describeError } = await import('./claude');
      const current = this.find(msg.id);
      const steps = current.steps.map((s) => (s.state === 'running' ? { ...s, state: 'skipped' as StepState } : s));
      this.patch(msg.id, { state: 'error', steps, card: lastCard, text: [current.text.trim(), describeError(err)].filter(Boolean).join('\n\n') });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private push(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'text' | 'state'>): ChatMessage {
    const msg: ChatMessage = { id: uid(), steps: [], at: Date.now(), ...partial };
    this.messages.update((list) => [...list, msg].slice(-MAX_KEPT));
    return msg;
  }

  private find(id: string): ChatMessage {
    return this.messages().find((m) => m.id === id) ?? { id, role: 'assistant', text: '', steps: [], state: 'done', at: 0 };
  }

  private patch(id: string, patch: Partial<ChatMessage>) {
    this.messages.update((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  private patchStep(id: string, index: number, patch: Partial<StepView>) {
    if (index < 0) return;
    this.messages.update((list) =>
      list.map((m) => (m.id === id ? { ...m, steps: m.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : m))
    );
  }
}
