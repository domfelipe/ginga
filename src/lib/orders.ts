import { getDb } from '@/lib/db';
import { getCatalogItems } from '@/lib/queries';

/**
 * Server-safe order-creation core (R5 DRY mandate): validation + catalog
 * pricing + insert, extracted verbatim from the original POST /api/orders body
 * so the HTTP route and the server-side apprentice executor share ONE
 * implementation. The route stays thin (parse → createOrder → map to Response).
 *
 * Behavior contract preserved from Task 7's route:
 * - validation failures → { ok:false, status:400, error } (identical messages)
 * - db failures        → { ok:false, status:500, error }
 * - success            → { ok:true, orderId, items, totalCents }
 */

export type OrderInputItem = { sku: string; qty: number };

export type PricedItem = {
  sku: string;
  name: string;
  qty: number;
  price_cents: number;
};

export type CreateOrderResult =
  | { ok: true; orderId: string; items: PricedItem[]; totalCents: number }
  | { ok: false; status: 400 | 500; error: string };

const MAX_STRING = 500;
const MAX_QTY = 99;

function fail(error: string): CreateOrderResult {
  return { ok: false, status: 400, error };
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

/**
 * Create an order from already-unfolded {sku, qty} items. `body` is the raw
 * request-shaped object (items, deliveryDate?, note?, channel, toolName?);
 * everything is validated/priced here, never trusted from the caller.
 */
export async function createOrder(body: unknown): Promise<CreateOrderResult> {
  try {
    if (body === null || typeof body !== 'object') {
      return fail('body must be a JSON object');
    }
    const parsed = body as {
      items?: unknown;
      deliveryDate?: unknown;
      note?: unknown;
      channel?: unknown;
      toolName?: unknown;
    };

    // channel: passthrough for both human checkout and future agent calls
    const { channel } = parsed;
    if (channel !== 'human' && channel !== 'agent') {
      return fail("channel must be 'human' or 'agent'");
    }

    // items: merge duplicate skus, then validate merged qty
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return fail('items must be a non-empty array');
    }
    const qtyBySku = new Map<string, number>();
    for (const entry of parsed.items) {
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
      deliveryDate = optionalString(parsed.deliveryDate, 'deliveryDate');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid deliveryDate');
    }
    if (deliveryDate !== null && !isIsoDate(deliveryDate)) {
      return fail('deliveryDate must be a valid YYYY-MM-DD date');
    }

    let note: string | null;
    try {
      note = optionalString(parsed.note, 'note');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid note');
    }

    let toolName: string | null;
    try {
      toolName = optionalString(parsed.toolName, 'toolName');
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'invalid toolName');
    }

    // validate skus against catalog and build items with name/price_cents from DB
    const db = getDb();
    const rows = await getCatalogItems(db);
    const bySku = new Map(rows.map((row) => [row.sku, row]));
    const unknownSkus = [...qtyBySku.keys()].filter((sku) => !bySku.has(sku));
    if (unknownSkus.length > 0) {
      return fail(`unknown sku(s): ${unknownSkus.join(', ')}`);
    }

    const items: PricedItem[] = [...qtyBySku.entries()].map(([sku, qty]) => {
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

    return {
      ok: true,
      orderId: (row as { id: string }).id,
      items,
      totalCents,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
