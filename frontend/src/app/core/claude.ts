import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { ArgKind, CommandSpec, DEFAULT_MODEL, Step, Surface } from './catalog';
import { StepOutcome } from './runtime.service';

const MAX_TURNS = 16;
const MAX_RESULT_CHARS = 8000;

export interface AgentHooks {
  text: (delta: string) => void;
  toolStart: (id: string, step: Step) => void;
  toolEnd: (id: string, outcome: StepOutcome) => void;
}

export interface AgentRequest {
  apiKey: string;
  model: string;
  history: BetaMessageParam[];
  prompt: string;
  catalog: CommandSpec[];
  surface: Surface;
  exec: (step: Step) => Promise<StepOutcome>;
  hooks: AgentHooks;
  signal: AbortSignal;
}

export interface AgentResult {
  text: string;
  history: BetaMessageParam[];
}

const JSON_TYPES: Record<ArgKind, object> = {
  string: { type: 'string' },
  bool: { type: 'boolean' },
  number: { type: 'number' },
  list: { type: 'array', items: { type: 'string' } },
};

export function toolsFor(catalog: CommandSpec[]): BetaTool[] {
  return catalog
    .filter((c) => c.name !== 'batch' && c.name !== 'help')
    .map((c) => ({
      name: c.name,
      description: `${c.summary}. Plugin: ${c.plugin}.`,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(c.args.map((x) => [x.name, { ...JSON_TYPES[x.kind], description: x.help }])),
        required: c.args.filter((x) => x.required).map((x) => x.name),
      },
    }));
}

function systemPrompt(surface: Surface): string {
  const where =
    surface === 'desktop'
      ? 'You are running inside the LCARS desktop shell on the user’s Windows PC, so tools act on their real machine.'
      : 'You are running in a web browser. Local files, apps and window controls are unavailable; say so briefly if asked for them.';
  return [
    'You are LCARS, a calm, capable assistant built into a minimalist desktop shell.',
    where,
    'Act through the tools. Break a request into as many steps as it needs and keep going until the whole request is done, using results from earlier steps to decide later ones.',
    'When order matters, call tools one at a time. Use the wait tool for requested pauses.',
    'Reply in one to three short, plain sentences. The interface already records every tool call, so never list tool calls, paste raw JSON, or narrate your process.',
    'If a step fails, try a sensible alternative once; otherwise say plainly what did not work.',
  ].join('\n');
}

function compact(outcome: StepOutcome): string {
  const body = outcome.ok ? JSON.stringify(outcome.data ?? null) : `error: ${outcome.error}`;
  return body.length > MAX_RESULT_CHARS ? `${body.slice(0, MAX_RESULT_CHARS)}… (truncated)` : body;
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.';
  if (err instanceof Anthropic.AuthenticationError) return 'Your Claude API key was rejected. Check it in settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key cannot use that model.';
  if (err instanceof Anthropic.NotFoundError) return 'That model is not available to this API key.';
  if (err instanceof Anthropic.RateLimitError) return 'Claude is rate limited right now. Try again in a moment.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your connection.';
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status ?? 'unknown'}).`;
  return err instanceof Error ? err.message : String(err);
}

export async function runAgent(req: AgentRequest): Promise<AgentResult> {
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true });
  const tools = toolsFor(req.catalog);
  const messages: BetaMessageParam[] = [...req.history, { role: 'user', content: req.prompt }];
  let text = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: req.model || DEFAULT_MODEL,
        max_tokens: 16000,
        system: systemPrompt(req.surface),
        tools,
        messages,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: req.signal }
    );
    let sawText = false;
    stream.on('text', (delta) => {
      if (!sawText && text) req.hooks.text('\n\n');
      sawText = true;
      text += delta;
      req.hooks.text(delta);
    });
    const message = await stream.finalMessage();
    messages.push({ role: 'assistant', content: message.content });

    if (message.stop_reason === 'refusal') {
      const note = 'I can’t help with that one.';
      req.hooks.text(note);
      return { text: text + note, history: messages };
    }
    if (message.stop_reason === 'pause_turn') continue;

    const calls = message.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
    if (!calls.length) return { text, history: messages };

    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const step: Step = { cmd: call.name, args: (call.input ?? {}) as Record<string, unknown> };
      req.hooks.toolStart(call.id, step);
      const outcome = await req.exec(step);
      req.hooks.toolEnd(call.id, outcome);
      results.push({ type: 'tool_result', tool_use_id: call.id, content: compact(outcome), is_error: !outcome.ok });
    }
    messages.push({ role: 'user', content: results });
  }
  const note = 'I stopped after many steps. Tell me if you want me to keep going.';
  req.hooks.text(note);
  return { text: text + note, history: messages };
}
