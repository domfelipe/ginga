import { getDb } from '@/lib/db';
import { runApprenticeTurn, type ApprenticeTurnResult } from '@/lib/apprentice';
import { createToolExecutor } from '@/lib/tool-executor-http';
import { getTaughtTools } from '@/lib/queries';

/**
 * Server-side orchestration for Modo Aprendiz. Extracted from the HTTP route so
 * the security boundary is STRUCTURAL, not just documented: the route
 * (src/app/api/apprentice/route.ts) is a thin adapter that only parses/validates
 * the request body and maps results; this module owns the env read and the db
 * SELECT for taught tools.
 *
 * The execute path has NO in-process SQL reach at all: tools run through the
 * same validated HTTP seam the browser bridge uses (createToolExecutor,
 * baseUrl = request origin → GET /api/catalog, POST /api/orders channel
 * 'agent'). The orders write path (createOrder) is reachable only from the
 * /api/orders route.
 *
 * The audited chain (see SECURITY.md at the repo root):
 *   history → OpenAI (chat) → tool_calls args → clampToolArgs (bounded)
 *   → substituteArgs (ajv schema) → foldSteps (ALLOWED_INTENTS + catalog skus)
 *   → POST /api/orders (full revalidation; tagged-template bound-param SQL,
 *   outside this module's reach).
 */

export type ValidatedHistory = { role: 'user' | 'assistant'; content: string }[];

const MAX_MESSAGES = 40;
const MAX_CONTENT = 2000;

/** Byte-compatible request-shape validation (was inline in the route). */
export function parseHistory(
  body: unknown,
): { ok: true; history: ValidatedHistory } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array' };
  }
  if (raw.length > MAX_MESSAGES) {
    return { ok: false, error: `messages must have at most ${MAX_MESSAGES} entries` };
  }
  const history: ValidatedHistory = [];
  for (const [i, entry] of raw.entries()) {
    if (entry === null || typeof entry !== 'object') {
      return { ok: false, error: `messages[${i}] must be an object` };
    }
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') {
      return { ok: false, error: `messages[${i}].role must be 'user' or 'assistant'` };
    }
    if (typeof content !== 'string' || content.length === 0) {
      return { ok: false, error: `messages[${i}].content must be a non-empty string` };
    }
    if (content.length > MAX_CONTENT) {
      return { ok: false, error: `messages[${i}].content must be at most ${MAX_CONTENT} chars` };
    }
    history.push({ role, content });
  }
  return { ok: true, history };
}

/**
 * One full apprentice turn, server-side. Reads OPENAI_API_KEY and the taught
 * tools (SELECT via getTaughtTools); tool execution happens over HTTP against
 * the same origin — exactly like the browser bridge.
 *
 * Throws on: missing key (friendly message, before any db/fetch work), db
 * failure, or OpenAI failure — the route maps every throw to 500 {error}.
 */
export async function handleApprenticeTurn(
  history: ValidatedHistory,
  origin: string,
): Promise<ApprenticeTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server');
  }

  const db = getDb();
  // same published-tools query as GET /api/tools — one implementation (R5)
  const tools = await getTaughtTools(db, false);
  // the ONE execute path, over HTTP: no in-process SQL in the LLM loop's reach
  const execute = createToolExecutor({ baseUrl: origin, tools, fetchImpl: globalThis.fetch });

  return runApprenticeTurn({
    apiKey,
    history,
    tools,
    fetchImpl: globalThis.fetch,
    execute,
  });
}
