import { getDb } from '@/lib/db';
import {
  makeServerToolExecutor,
  runApprenticeTurn,
  type ApprenticeTurnResult,
} from '@/lib/apprentice';
import { createOrder } from '@/lib/orders';
import { getCatalogItems, getTaughtTools } from '@/lib/queries';

/**
 * Server-side orchestration for Modo Aprendiz. Extracted from the HTTP route so
 * the security boundary is STRUCTURAL, not just documented: the route
 * (src/app/api/apprentice/route.ts) is a thin adapter that only parses/validates
 * the request body and maps results — every credential read (process.env), every
 * db access, and the sql-reaching executor closure live exclusively here.
 *
 * The audited chain (see SECURITY.md at the repo root):
 *   history → OpenAI (chat) → tool_calls args → clampToolArgs (bounded)
 *   → substituteArgs (ajv schema) → foldSteps (ALLOWED_INTENTS + catalog skus)
 *   → createOrder (full revalidation; tagged-template bound-param SQL only).
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
 * One full apprentice turn, server-side. The ONLY place that touches
 * OPENAI_API_KEY, the db, and tool execution for this endpoint.
 *
 * Throws on: missing key (friendly message, before any db/fetch work), db
 * failure, or OpenAI failure — the route maps every throw to 500 {error}.
 */
export async function handleApprenticeTurn(history: ValidatedHistory): Promise<ApprenticeTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server');
  }

  const db = getDb();
  // same published-tools query as GET /api/tools and same catalog as the
  // order pricing — one implementation each (src/lib/queries.ts, R5)
  const [tools, catalog] = await Promise.all([getTaughtTools(db, false), getCatalogItems(db)]);
  const execute = makeServerToolExecutor(tools, catalog, createOrder);

  return runApprenticeTurn({
    apiKey,
    history,
    tools,
    catalog,
    fetchImpl: globalThis.fetch,
    execute,
  });
}
