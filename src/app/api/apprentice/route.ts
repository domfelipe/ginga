import { handleApprenticeTurn, parseHistory } from '@/lib/apprentice-server';

export const dynamic = 'force-dynamic';

// POST /api/apprentice {messages:[{role:'user'|'assistant',content}]}
//   → 200 {reply, toolCalls:[{name,args,resultText}]}
//   | 400 {error} (bad body) | 500 {error} (no OPENAI_API_KEY / OpenAI failure)
//
// Thin HTTP adapter (security boundary): request parsing/validation and error
// mapping ONLY. All env reads, db access and tool execution live in
// src/lib/apprentice-server.ts (handleApprenticeTurn) — the judge-facing
// fallback runs the same taught tools through the same execute path as a real
// WebMCP agent, and each invoked tool comes back in `toolCalls` as the
// discovery/invocation trace for the UI.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseHistory(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const result = await handleApprenticeTurn(parsed.history);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'unknown apprentice error' },
      { status: 500 },
    );
  }
}
