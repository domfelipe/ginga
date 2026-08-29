import { getDb } from '@/lib/db';
import {
  runApprenticeTurn,
  makeServerToolExecutor,
  type ApprenticeTurnResult,
} from '@/lib/apprentice';
import { createOrder } from '@/lib/orders';
import { getCatalogItems, getTaughtTools } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// POST /api/apprentice {messages:[{role:'user'|'assistant',content}]}
//   → 200 {reply, toolCalls:[{name,args,resultText}]}
//   | 400 {error} (bad body) | 500 {error} (no OPENAI_API_KEY / OpenAI failure)
//
// The judge-facing fallback: same taught tools, same execute logic as the real
// WebMCP agent (substituteArgs → foldSteps → createOrder channel:'agent'), run
// server-side via OpenAI function calling. Each invoked tool is returned in
// `toolCalls` as the discovery/invocation trace for the UI.
const MAX_MESSAGES = 40;
const MAX_CONTENT = 2000;

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

function parseHistory(body: unknown): { ok: true; history: HistoryMessage[] } | { ok: false; error: string } {
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
  const history: HistoryMessage[] = [];
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseHistory(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not configured on the server' },
      { status: 500 },
    );
  }

  try {
    const db = getDb();
    // same published-tools query as GET /api/tools and same catalog as the
    // order pricing — one implementation each (src/lib/queries.ts, R5)
    const [tools, catalog] = await Promise.all([getTaughtTools(db, false), getCatalogItems(db)]);
    const execute = makeServerToolExecutor(tools, catalog, createOrder);

    const result: ApprenticeTurnResult = await runApprenticeTurn({
      apiKey,
      history: parsed.history,
      tools,
      catalog,
      fetchImpl: globalThis.fetch,
      execute,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'unknown apprentice error' },
      { status: 500 },
    );
  }
}
