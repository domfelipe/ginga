import { validateTool } from './placeholders';
import type { CompiledTool, IntentTraceStep } from './types';

/**
 * The fixed compiler prompt. It defines the JSON contract the model must
 * return; structure is then enforced by validateTool (not by the API) — see
 * the response_format DECISION below.
 */
export const SYSTEM_PROMPT = `You convert a human's demonstrated web flow into a single MCP tool definition.
Given a narration and an ordered trace of semantic UI intents, output JSON:
{"name": snake_case verb_noun, "description": one clear sentence for an AI agent,
 "inputSchema": {"type":"object","properties":{...},"required":[...]},
 "steps": [{"intent": one of ALLOWED, "params": {...}}]}
Rules: demonstrated variable values (quantities, dates, notes, item names) become
{{snake_case}} placeholders in steps params AND properties in inputSchema with the
demonstrated value as "default" and "examples". Constant values (fixed sku chosen in
the flow) stay literal. Use intents only from ALLOWED. Reuse the trace order.`;

export class CompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompilerError';
  }
}

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

export interface CompileInput {
  narration: string;
  trace: IntentTraceStep[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Compile a recorded flow ({narration, trace}) into a CompiledTool via the
 * OpenAI chat completions API. Pure/injectable: fetchImpl is provided by the
 * caller (tests inject a fake; the route passes global fetch + the API key).
 *
 * DECISION (controller ruling): OpenAI strict `json_schema` response format
 * requires every property to be required with additionalProperties:false at
 * ALL levels, and does NOT support an arbitrary nested JSON Schema (our
 * user-authored inputSchema) inside it. We therefore use `json_object` mode
 * and enforce the CompiledTool structure with validateTool after parsing.
 * Any structure violation (hallucinated {{placeholder}}, unknown intent,
 * malformed name/description) becomes a CompilerError → HTTP 400 upstream.
 */
export async function compileTool(
  input: CompileInput,
  fetchImpl: FetchLike = globalThis.fetch,
  apiKey = '',
): Promise<CompiledTool> {
  const { narration, trace } = input;

  // fail before spending a token: there is nothing to compile from
  if (!Array.isArray(trace) || trace.length === 0) {
    throw new CompilerError('cannot compile an empty trace — record at least one step first');
  }

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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ narration, trace }) },
        ],
      }),
    });
  } catch (err) {
    throw new CompilerError(
      `compilation request to OpenAI failed: ${err instanceof Error ? err.message : String(err)}`,
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
    throw new CompilerError(
      `OpenAI compilation request failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  let content: string | undefined;
  try {
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content;
  } catch (err) {
    throw new CompilerError(
      `OpenAI response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof content !== 'string' || content.length === 0) {
    throw new CompilerError('OpenAI returned an empty completion');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new CompilerError(
      `compiler returned invalid JSON (first 200 chars): ${content.slice(0, 200)}`,
    );
  }

  const result = validateTool(raw as CompiledTool);
  if (!result.ok) {
    throw new CompilerError(`compiler produced an invalid tool: ${result.error}`);
  }
  return raw as CompiledTool;
}
