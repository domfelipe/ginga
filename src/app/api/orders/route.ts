import { getDb } from '@/lib/db';
import type { OrderRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type OrderBody = {
  items?: unknown;
  deliveryDate?: unknown;
  note?: unknown;
  channel?: unknown;
  toolName?: unknown;
};

type CatalogRow = { sku: string; name: string; price_cents: number };

const MAX_STRING = 500;
const MAX_QTY = 99;

function fail(error: string) {
  return Response.json({ ok: false, error }, { status: 400 });
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  if (value.length > MAX_STRING) throw new Error(`${field} must be at most ${MAX_STRING} chars`);
  return value.length === 0 ? null : value;
}

type DbOrderRow = Omit<OrderRow, 'created_at' | 'delivery_date'> & {
  created_at: Date | string;
  delivery_date: Date | string | null;
};

// GET returns { orders: OrderRow[] } — latest 50, newest first (created_at desc).
export async function GET() {
  try {
    const db = getDb();
    const rows = (await db`
      select id, items, delivery_date, note, total_cents, channel, tool_name, created_at
      from orders
      order by created_at desc
      limit 50
    `) as DbOrderRow[];
    // date/timestamptz columns arrive as Date from the driver; OrderRow wants strings
    const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);
    const orders: OrderRow[] = rows.map((row) => ({
      ...row,
      delivery_date:
        row.delivery_date === null
          ? null
          : (row.delivery_date instanceof Date
              ? row.delivery_date.toISOString().slice(0, 10)
              : row.delivery_date),
      created_at: iso(row.created_at),
    }));
    return Response.json({ orders });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as OrderBody | null;
    if (body === null || typeof body !== 'object') {
      return fail('body must be a JSON object');
    }

    // channel: passthrough for both human checkout and future agent calls
    const { channel } = body;
    if (channel !== 'human' && channel !== 'agent') {
      return fail("channel must be 'human' or 'agent'");
    }

    // items: merge duplicate skus, then validate merged qty
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return fail('items must be a non-empty array');
    }
    const qtyBySku = new Map<string, number>();
    for (const entry of body.items) {
      if (entry === null || typeof entry !== 'object') {
        return fail('each item must be an object with sku and qty');
      }
      const { sku, qty } = entry as { sku?: unknown; qty?: unknown };
      if (typeof sku !== 'string' || sku.length === 0 || sku.length > MAX_STRING) {
        return fail(`item.sku must be a string of 1..${MAX_STRING} chars`);
      }
      if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) {
        return fail(`item.qty for "${sku}" must be an integer between 1 and ${MAX_QTY}`);
      }
      qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + (qty as number));
    }
    for (const [sku, qty] of qtyBySku) {
      if (qty > MAX_QTY) {
        return fail(`combined qty for "${sku}" must be at most ${MAX_QTY}`);
      }
    }

    let deliveryDate: string | null;
    try {
      deliveryDate = optionalString(body.deliveryDate, 'deliveryDate');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid deliveryDate');
    }
    if (deliveryDate !== null && !isIsoDate(deliveryDate)) {
      return fail('deliveryDate must be a valid YYYY-MM-DD date');
    }

    let note: string | null;
    try {
      note = optionalString(body.note, 'note');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid note');
    }

    let toolName: string | null;
    try {
      toolName = optionalString(body.toolName, 'toolName');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid toolName');
    }

    // validate skus against catalog and build items with name/price_cents from DB
    const db = getDb();
    const rows = (await db`
      select ci.sku, ci.name, ci.price_cents
      from catalog_items ci
      join stores s on s.id = ci.store_id
      where s.slug = 'aurora'
    `) as CatalogRow[];
    const bySku = new Map(rows.map((row) => [row.sku, row]));
    const unknownSkus = [...qtyBySku.keys()].filter((sku) => !bySku.has(sku));
    if (unknownSkus.length > 0) {
      return fail(`unknown sku(s): ${unknownSkus.join(', ')}`);
    }

    const items = [...qtyBySku.entries()].map(([sku, qty]) => {
      const row = bySku.get(sku)!;
      return { sku, name: row.name, qty, price_cents: row.price_cents };
    });
    const totalCents = items.reduce((acc, item) => acc + item.qty * item.price_cents, 0);

    // tagged template only: every value is a driver parameter, no string interpolation
    const [row] = await db`
      insert into orders (store_id, items, delivery_date, note, total_cents, channel, tool_name)
      select id, ${JSON.stringify(items)}::jsonb, ${deliveryDate}, ${note}, ${totalCents}, ${channel}, ${toolName}
      from stores
      where slug = 'aurora'
      returning id
    `;

    return Response.json({ orderId: row.id }, { status: 201 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}
