import { CompilerError, compileTool } from '@/lib/compilation';
import type { IntentTraceStep } from '@/lib/types';

type CompileBody = { narration?: unknown; trace?: unknown };

// Input caps — /api/compile is unauthenticated on a public URL, so every
// request is bounded BEFORE any OpenAI spend, mirroring the apprentice
// (40 msgs × 2000 chars) and orders (500-char strings) discipline.
const MAX_NARRATION = 2000;
const MAX_TRACE_STEPS = 200;
const MAX_PARAM_VALUE = 500;

// strings are measured directly; anything else by its JSON size so nested
// objects/arrays cannot smuggle unbounded payloads past the cap
function paramValueSize(value: unknown): number {
  if (typeof value === 'string') return value.length;
  return (JSON.stringify(value ?? null) as string).length;
}

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
  if (narration.length > MAX_NARRATION) {
    return Response.json(
      { error: `narration must be at most ${MAX_NARRATION} chars` },
      { status: 400 },
    );
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
  if (trace.length > MAX_TRACE_STEPS) {
    return Response.json(
      { error: `trace must have at most ${MAX_TRACE_STEPS} steps` },
      { status: 400 },
    );
  }
  for (const [i, step] of trace.entries()) {
    if (step === null || typeof step !== 'object') continue; // step shape is compileTool's job
    const params = (step as { params?: unknown }).params;
    if (params === null || typeof params !== 'object') continue;
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (paramValueSize(value) > MAX_PARAM_VALUE) {
        return Response.json(
          { error: `trace[${i}].params.${key} must be at most ${MAX_PARAM_VALUE} chars` },
          { status: 400 },
        );
      }
    }
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
