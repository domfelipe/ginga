import { CompilerError, compileTool } from '@/lib/compilation';
import type { IntentTraceStep } from '@/lib/types';

type CompileBody = { narration?: unknown; trace?: unknown };

// POST /api/compile {narration, trace} → 200 {tool: CompiledTool} | 400 {error}
// Server-only: the OPENAI_API_KEY is read here and never reaches the client.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CompileBody | null;
  if (body === null || typeof body !== 'object') {
    return Response.json({ error: 'body must be a JSON object' }, { status: 400 });
  }
  const { narration, trace } = body;
  if (typeof narration !== 'string') {
    return Response.json({ error: 'narration must be a string' }, { status: 400 });
  }
  if (!Array.isArray(trace)) {
    return Response.json({ error: 'trace must be an array of intent steps' }, { status: 400 });
  }
  if (trace.length === 0) {
    return Response.json(
      { error: 'trace is empty — record at least one step before compiling' },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not configured on the server' },
      { status: 500 },
    );
  }

  try {
    const tool = await compileTool(
      { narration, trace: trace as IntentTraceStep[] },
      globalThis.fetch,
      apiKey,
    );
    return Response.json({ tool });
  } catch (err) {
    if (err instanceof CompilerError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'unknown compilation error' },
      { status: 500 },
    );
  }
}
