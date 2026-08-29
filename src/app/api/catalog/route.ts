import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// R6 (public demo, no PII): public/sdk.js fetches this cross-origin from any
// external site running the exported snippet, so every JSON response —
// including the 500 — carries a permissive ACAO (same rationale as /api/tools).
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  try {
    const db = getDb();
    const items = await db`
      select ci.sku, ci.name, ci.description, ci.price_cents, ci.emoji
      from catalog_items ci
      join stores s on s.id = ci.store_id
      where s.slug = 'aurora' and ci.available
      order by ci.price_cents asc, ci.sku asc
    `;
    return Response.json({ ok: true, items }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
