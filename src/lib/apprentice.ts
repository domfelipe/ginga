import { substituteArgs, type InputSchema } from './placeholders';
import { foldSteps, formatOrderResultText, type FoldCatalogItem } from './tool-executor';
import type { TaughtTool } from './types';

/**
 * Modo Aprendiz plumbing (server-safe, pure/injectable — no db, no process.env):
 *
 * - toOpenAITools: TaughtTool[] → OpenAI function definitions
 * - parseOpenAIToolCalls: OpenAI assistant message → executable calls
 * - executeToolCalls: runs calls via an injected executor and builds the
 *   role:'tool' follow-up messages (the follow-up message-building contract)
 * - runApprenticeTurn: the bounded function-calling loop (≤2 tool rounds), with
 *   fetchImpl + executor injected so tests drive it with a mocked OpenAI.
 *
 * The route (src/app/api/apprentice/route.ts) owns the impure edges: env key,
 * db reads, and building the real executor from createOrder (src/lib/orders.ts).
 */

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 2;

export const APPRENTICE_SYSTEM_PROMPT =
  'You are Ginga, the apprentice of Padaria Aurora, a Brazilian bakery. ' +
  'You can call the tools you were taught to place orders on the customer\'s behalf. ' +
  'When the user wants to order, pick the matching tool, fill every required argument ' +
  'from the conversation (ask only if a required value is missing), and report the ' +
  'order confirmation. Otherwise answer briefly. Reply in the user\'s language.';

// --- types ---------------------------------------------------------------------

export interface OpenAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export interface ParsedToolCall {
  id: string;
  name: string;
  argsRaw: string;
}

/** One discovery/invocation proof for the UI trace: tool + args + result. */
export interface ToolCallTrace {
  name: string;
  args: Record<string, unknown>;
  resultText: string;
}

export interface ApprenticeTurnResult {
  reply: string;
  toolCalls: ToolCallTrace[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// --- OpenAI request/response mapping -------------------------------------------

/** TaughtTool[] → OpenAI `tools` function definitions. */
export function toOpenAITools(tools: TaughtTool[]): OpenAIToolDef[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/** Assistant message → executable calls; malformed entries are skipped. */
export function parseOpenAIToolCalls(message: unknown): ParsedToolCall[] {
  if (message === null || typeof message !== 'object') return [];
  const raw = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(raw)) return [];
  const calls: ParsedToolCall[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const { id, function: fn } = entry as {
      id?: unknown;
      function?: unknown;
    };
    if (typeof id !== 'string' || fn === null || typeof fn !== 'object') continue;
    const { name, arguments: argsRaw } = fn as { name?: unknown; arguments?: unknown };
    if (typeof name !== 'string') continue;
    calls.push({ id, name, argsRaw: typeof argsRaw === 'string' ? argsRaw : '' });
  }
  return calls;
}

/**
 * Execute tool calls via the injected executor and build the follow-up
 * `role:'tool'` messages (one per call, keyed by tool_call_id, in call order).
 * The executor returns the result text or throws — a throw becomes the tool
 * message content so the model can recover, it never rejects the turn.
 */
export async function executeToolCalls(
  calls: ParsedToolCall[],
  execute: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<{ followUpMessages: OpenAIMessage[]; traces: ToolCallTrace[] }> {
  const followUpMessages: OpenAIMessage[] = [];
  const traces: ToolCallTrace[] = [];

  for (const call of calls) {
    let args: Record<string, unknown> = {};
    let resultText: string;
    if (call.argsRaw.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(call.argsRaw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        } else {
          throw new Error('arguments must be a JSON object');
        }
      } catch (err) {
        resultText = `invalid tool arguments (invalid JSON): ${
          err instanceof Error ? err.message : String(err)
        }`;
        followUpMessages.push({ role: 'tool', tool_call_id: call.id, content: resultText });
        traces.push({ name: call.name, args, resultText });
        continue;
      }
    }
    try {
      resultText = await execute(call.name, args);
    } catch (err) {
      resultText = err instanceof Error ? err.message : 'unknown tool error';
    }
    followUpMessages.push({ role: 'tool', tool_call_id: call.id, content: resultText });
    traces.push({ name: call.name, args, resultText });
  }

  return { followUpMessages, traces };
}

// --- the bounded function-calling loop -------------------------------------------

function buildApprenticeMessages(
  history: { role: 'user' | 'assistant'; content: string }[],
): OpenAIMessage[] {
  return [
    { role: 'system', content: APPRENTICE_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

async function chatCompletion(
  fetchImpl: FetchLike,
  apiKey: string,
  messages: OpenAIMessage[],
  tools: OpenAIToolDef[] | undefined,
  forceText: boolean,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(forceText ? { tool_choice: 'none' } : {}),
      }),
    });
  } catch (err) {
    throw new Error(
      `apprentice request to OpenAI failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } | string };
      detail = typeof body?.error === 'string' ? body.error : (body?.error?.message ?? '');
    } catch {
      // non-JSON error body — the status alone is still actionable
    }
    throw new Error(
      `OpenAI apprentice request failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }
  const data = (await response.json()) as {
    choices?: { message?: Record<string, unknown> }[];
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('OpenAI returned no assistant message');
  return message;
}

export interface ApprenticeTurnOptions {
  apiKey: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  tools: TaughtTool[];
  catalog: FoldCatalogItem[];
  fetchImpl: FetchLike;
  /** Executor for taught tools; returns the result text or throws on failure. */
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/**
 * One chat turn: system + history → OpenAI with the taught tools as functions.
 * If the model answers with tool_calls, each call is executed (up to
 * MAX_TOOL_ROUNDS rounds) and the results are fed back as role:'tool' messages
 * until a final natural-language reply arrives. Bounded twice: after
 * MAX_TOOL_ROUNDS the next request forces tool_choice:'none', and a structural
 * break at the loop top returns a fallback reply if tool_calls keep coming
 * regardless (≤ MAX_TOOL_ROUNDS + 2 OpenAI calls, always terminates).
 */
export async function runApprenticeTurn(opts: ApprenticeTurnOptions): Promise<ApprenticeTurnResult> {
  const messages = buildApprenticeMessages(opts.history);
  const openaiTools = toOpenAITools(opts.tools);
  const traces: ToolCallTrace[] = [];

  for (let round = 0; ; round++) {
    // Structural break (T8 review carry-in): the forced tool_choice:'none'
    // below is advisory — a hostile/broken runtime could keep returning
    // tool_calls anyway. This hard cap guarantees the loop always terminates.
    if (round > MAX_TOOL_ROUNDS) {
      return {
        reply:
          'I could not complete that with the available tools (too many tool rounds). Please rephrase and try again.',
        toolCalls: traces,
      };
    }
    const forceText = round >= MAX_TOOL_ROUNDS;
    const message = await chatCompletion(
      opts.fetchImpl,
      opts.apiKey,
      messages,
      openaiTools,
      forceText,
    );
    const calls = parseOpenAIToolCalls(message);
    if (calls.length === 0) {
      const content = (message as { content?: unknown }).content;
      return { reply: typeof content === 'string' ? content : '', toolCalls: traces };
    }

    // assistant turn that asked for the tools, verbatim, so OpenAI can pair ids
    messages.push({ role: 'assistant', content: null, tool_calls: message.tool_calls });
    const { followUpMessages, traces: newTraces } = await executeToolCalls(
      calls,
      async (name, args) => {
        const text = await opts.execute(name, args);
        return text;
      },
    );
    messages.push(...followUpMessages);
    traces.push(...newTraces);
  }
}

// --- server-side executor factory (assembled by the route) ------------------------

/**
 * Build the executor for taught tools using the SAME logic as the client
 * buildExecute (webmcp.ts): substituteArgs → foldSteps → createOrder with
 * channel 'agent'. Throws on failure (executeToolCalls captures the message);
 * success returns the shared formatOrderResultText contract. Catalog is
 * pre-fetched by the caller (server-side, from Neon).
 */
export function makeServerToolExecutor(
  tools: TaughtTool[],
  catalog: FoldCatalogItem[],
  createOrderImpl: (body: unknown) => Promise<{
    ok: boolean;
    status?: number;
    error?: string;
    orderId?: string;
    totalCents?: number;
    items?: { sku: string; name: string; qty: number }[];
  }>,
): (name: string, args: Record<string, unknown>) => Promise<string> {
  return async (name, args) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`tool "${name}" is not registered`);
    // same pipeline as buildExecute: ajv-validated placeholder substitution,
    // then fold resolved steps into the order draft
    const steps = substituteArgs(tool.steps, args, tool.inputSchema as InputSchema);
    const folded = foldSteps(steps, catalog);
    const result = await createOrderImpl({
      items: folded.items.map(({ sku, qty }) => ({ sku, qty })),
      deliveryDate: folded.deliveryDate ?? undefined,
      note: folded.note ?? undefined,
      channel: 'agent',
      toolName: tool.name,
    });
    if (!result.ok) {
      throw new Error(result.error ?? `order failed with status ${result.status ?? 500}`);
    }
    return formatOrderResultText(
      result.orderId ?? '',
      folded.items,
      folded.deliveryDate,
      result.totalCents ?? 0,
    );
  };
}
