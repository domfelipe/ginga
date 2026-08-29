import type { Db } from '@/lib/db';
import type { TaughtTool, ToolStep } from '@/lib/types';
import type { FoldCatalogItem } from '@/lib/tool-executor';

/**
 * Shared server-side DB reads (single implementation, multiple routes — R5):
 *
 * - getTaughtTools: published (or all, `?all=1` studio view) taught tools —
 *   used by GET /api/tools and the apprentice route.
 * - getCatalogItems: sku/name/price catalog for the aurora store — used by
 *   createOrder (pricing) and the apprentice route (fold catalog).
 */

type DbToolRow = Omit<TaughtTool, 'inputSchema' | 'created_at'> & {
  input_schema: TaughtTool['inputSchema'];
  created_at: Date | string;
};

/**
 * `all=false` returns only published:true tools; ordering is stable
 * (created_at asc). jsonb columns arrive parsed; timestamptz arrives as Date —
 * TaughtTool wants an ISO string for created_at.
 */
export async function getTaughtTools(db: Db, all: boolean): Promise<TaughtTool[]> {
  const rows = (
    all
      ? await db`
          select id, store_id, name, description, input_schema, steps, published, created_at
          from taught_tools
          order by created_at asc
        `
      : await db`
          select id, store_id, name, description, input_schema, steps, published, created_at
          from taught_tools
          where published = true
          order by created_at asc
        `
  ) as (DbToolRow & { steps: ToolStep[] })[];

  return rows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    name: row.name,
    description: row.description,
    inputSchema: row.input_schema,
    steps: row.steps,
    published: row.published,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

/** Catalog (aurora store) with prices; no availability filter — an agent may
 * order any sku the store sells, matching createOrder's validation. */
export async function getCatalogItems(
  db: Db,
): Promise<(FoldCatalogItem & { price_cents: number })[]> {
  return (await db`
    select ci.sku, ci.name, ci.price_cents
    from catalog_items ci
    join stores s on s.id = ci.store_id
    where s.slug = 'aurora'
  `) as (FoldCatalogItem & { price_cents: number })[];
}
