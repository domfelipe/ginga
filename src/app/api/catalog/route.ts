import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
    return Response.json({ ok: true, items });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}
