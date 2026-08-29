import { formatUSD } from './money';
import type { ToolStep } from './types';

/**
 * Server-safe, pure tool-execution semantics shared by BOTH surfaces of the
 * agent seam (R5 DRY mandate):
 *
 * - the client-side WebMCP registry (src/lib/webmcp.ts re-exports these), and
 * - the server-side apprentice route (src/app/api/apprentice/route.ts).
 *
 * No db import, no fetch, no document/window — safe to import from node and
 * browser bundles alike. Order persistence lives in src/lib/orders.ts (server
 * only); this module only folds traces and formats results.
 */

// --- foldSteps: pure semantics of a recorded trace ---------------------------

export interface FoldCatalogItem {
  sku: string;
  name: string;
}

export interface FoldedItem {
  sku: string;
  name: string;
  qty: number;
}

export interface FoldedOrder {
  items: FoldedItem[];
  deliveryDate: string | null;
  note: string | null;
}

/**
 * Fold resolved steps into an order draft. Pure: add_item accumulates qty by
 * sku (first-seen order), set_delivery/set_note overwrite, view_item and
 * confirm_order don't fold into the order. Unknown sku → Error('unknown sku: …').
 */
export function foldSteps(steps: ToolStep[], catalog: FoldCatalogItem[]): FoldedOrder {
  const catalogBySku = new Map(catalog.map((item) => [item.sku, item]));
  const items: FoldedItem[] = [];
  const indexBySku = new Map<string, number>();
  let deliveryDate: string | null = null;
  let note: string | null = null;

  for (const step of steps) {
    switch (step.intent) {
      case 'add_item': {
        const sku = String(step.params.sku ?? '');
        const entry = catalogBySku.get(sku);
        if (!entry) throw new Error(`unknown sku: ${sku}`);
        const qty = Number(step.params.qty);
        if (!Number.isFinite(qty) || qty < 1) throw new Error(`invalid qty for sku: ${sku}`);
        const existing = indexBySku.get(sku);
        if (existing === undefined) {
          indexBySku.set(sku, items.length);
          items.push({ sku, name: entry.name, qty });
        } else {
          items[existing]!.qty += qty;
        }
        break;
      }
      case 'set_delivery':
        if (step.params.date !== undefined) deliveryDate = String(step.params.date);
        break;
      case 'set_note':
        if (step.params.text !== undefined) note = String(step.params.text);
        break;
      default:
        break; // view_item / confirm_order are trace metadata, not order content
    }
  }

  return { items, deliveryDate, note };
}

// --- shared result text --------------------------------------------------------

/**
 * The order-confirmation text contract quoted back to agents. Used verbatim by
 * the client buildExecute (webmcp.ts) and the server apprentice executor so a
 * tool call produces the same answer no matter which surface ran it.
 */
export function formatOrderResultText(
  orderId: string,
  items: FoldedItem[],
  deliveryDate: string | null,
  totalCents: number,
): string {
  const lines = items.map((item) => `${item.qty}x ${item.name}`).join(', ');
  const deliver = deliveryDate ? `, deliver ${deliveryDate}` : '';
  return `Order #${orderId} created: ${lines}${deliver}. Total ${formatUSD(totalCents)}.`;
}
