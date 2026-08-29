import { getDb } from '@/lib/db';
import { createOrder } from '@/lib/orders';
import type { OrderRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type DbOrderRow = Omit<OrderRow, 'created_at' | 'delivery_date'> & {
  created_at: Date | string;
  delivery_date: Date | string | null;
};

// GET returns { orders: OrderRow[] } — latest 50, newest first (created_at desc).
// T4 carry-in: date columns are normalized with UTC getters — a date stored as
// timestamptz at UTC midnight must not shift a day when the server TZ is ahead
// of UTC (toISOString() formats in UTC but slice() here kept the same pitfall
// for non-midnight values; getUTC* is explicit and timezone-independent).
function isoDateUTC(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
          : (row.delivery_date instanceof Date ? isoDateUTC(row.delivery_date) : row.delivery_date),
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

// POST creates an order. Thin HTTP shell (R5): validation + pricing + insert
// live in createOrder (src/lib/orders.ts), shared verbatim with the apprentice
// route's server-side tool executor.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await createOrder(body);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  // items/totalCents are additive since Task 7: the agent execute path quotes
  // the server-authoritative order in its CallToolResult text (no client-side
  // pricing duplication). orderId remains the only field the cart consumes.
  return Response.json(
    { orderId: result.orderId, items: result.items, totalCents: result.totalCents },
    { status: 201 },
  );
}
