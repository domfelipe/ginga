import { getDb } from '@/lib/db';
import { validateTool } from '@/lib/placeholders';
import { getTaughtTools } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// R6: public demo, no PII — the exported sdk.js consumes this cross-origin.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// GET returns { tools: TaughtTool[] } — `?all=1` (studio) includes drafts,
// otherwise only published:true. Registration order is stable (created_at asc).
// Row mapping/query live in getTaughtTools (src/lib/queries.ts), shared with
// the apprentice route (R5: one implementation, multiple surfaces).
export async function GET(req: Request) {
  try {
    const all = new URL(req.url).searchParams.get('all') === '1';
    const db = getDb();
    const tools = await getTaughtTools(db, all);
    return Response.json({ tools }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { tool?: unknown } | null;
    if (body === null || typeof body !== 'object' || body.tool === null || typeof body.tool !== 'object') {
      return Response.json({ error: 'body must be { tool: CompiledTool }' }, { status: 400 });
    }
    const tool = body.tool as { steps?: unknown; name?: unknown } & Record<string, unknown>;

    // T6 review carry-in: a tool with no steps is rejected here with an explicit
    // route check (validateTool intentionally accepts an empty steps array, so
    // it is not the enforcement point for this rule).
    if (!Array.isArray(tool.steps) || tool.steps.length === 0) {
      return Response.json({ error: 'steps must be a non-empty array' }, { status: 400 });
    }

    const validation = validateTool(tool as never);
    if (!validation.ok) {
      return Response.json({ error: validation.error ?? 'invalid tool' }, { status: 400 });
    }

    const db = getDb();
    // tagged template only: every value is a driver parameter. R3: a name that
    // already exists for the store conflicts → 0 inserted rows → 409.
    const inserted = await db`
      insert into taught_tools (store_id, name, description, input_schema, steps, published)
      select id, ${tool.name as string}, ${tool.description as string}, ${JSON.stringify(tool.inputSchema)}::jsonb, ${JSON.stringify(tool.steps)}::jsonb, true
      from stores
      where slug = 'aurora'
      on conflict (store_id, name) do nothing
      returning id
    `;
    if (inserted.length === 0) {
      return Response.json(
        { error: `tool "${String(tool.name)}" already exists for this store` },
        { status: 409 },
      );
    }
    return Response.json({ id: (inserted[0] as { id: string }).id }, { status: 201 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}
