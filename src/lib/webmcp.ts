import { formatUSD } from './money';
import { substituteArgs, type InputSchema } from './placeholders';
import type { TaughtTool, ToolStep } from './types';

/**
 * WebMCP bridge: turns TaughtTools into executable agent tools.
 *
 * - In a WebMCP-capable browser (document.modelContext, e.g. Chrome with the
 *   flag) tools are registered with the runtime so external agents see them.
 * - Everywhere else the same registry + execute functions power the in-app
 *   fallback (Task 8's apprentice panel) — one shared execute path, no
 *   duplicated fold/POST logic.
 *
 * This module is client-safe: no db import, `document` access is guarded with
 * typeof so tests can import it in node. foldSteps is pure and exported.
 */

export interface ToolCallContent {
  type: 'text';
  text: string;
}

/** Minimal CallToolResult shape agents receive back from a tool call. */
export interface ToolCallResult {
  content: ToolCallContent[];
  isError?: boolean;
}

export interface ToolRegistryEntry {
  tool: TaughtTool;
  execute: (args: Record<string, unknown>) => Promise<ToolCallResult>;
}

/** Structural type for document.modelContext (no upstream TS type exists). */
export type ModelContext = { registerTool: (t: unknown) => void };

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

// --- model context feature-detect --------------------------------------------

export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null;
  const candidate: unknown = (document as { modelContext?: unknown }).modelContext;
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof (candidate as { registerTool?: unknown }).registerTool === 'function'
  ) {
    return candidate as ModelContext;
  }
  return null;
}

function debugLog(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('debug') === null) return;
  console.debug('[ginga:webmcp]', ...args);
}

// --- registry (module-level, shared by real registration and apprentice) -----

const registry: ToolRegistryEntry[] = [];

export function getRegistry(): ToolRegistryEntry[] {
  return registry;
}

// --- execute ------------------------------------------------------------------

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

interface CatalogEntry {
  sku: string;
  name: string;
}

async function fetchCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`failed to load catalog (status ${res.status})`);
  const data = (await res.json()) as { items?: CatalogEntry[] };
  if (!Array.isArray(data.items)) throw new Error('catalog response is malformed');
  return data.items;
}

function formatOrderText(
  orderId: string,
  items: FoldedItem[],
  deliveryDate: string | null,
  totalCents: number,
): string {
  const lines = items.map((item) => `${item.qty}x ${item.name}`).join(', ');
  const deliver = deliveryDate ? `, deliver ${deliveryDate}` : '';
  return `Order #${orderId} created: ${lines}${deliver}. Total ${formatUSD(totalCents)}.`;
}

/**
 * Shared execute path for a taught tool: validateArgs via ajv(inputSchema) →
 * substituteArgs → foldSteps → POST /api/orders with channel 'agent'. Used BOTH
 * by real WebMCP registration and by the apprentice fallback (Task 8).
 */
export function buildExecute(tool: TaughtTool): ToolRegistryEntry['execute'] {
  return async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      // validates args against inputSchema (ajv) and resolves {{placeholders}};
      // validateTool already guarantees the schema's object shape
      const steps = substituteArgs(tool.steps, args, tool.inputSchema as InputSchema);
      const catalog = await fetchCatalog();
      const folded = foldSteps(steps, catalog);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: folded.items.map(({ sku, qty }) => ({ sku, qty })),
          deliveryDate: folded.deliveryDate ?? undefined,
          note: folded.note ?? undefined,
          channel: 'agent',
          toolName: tool.name,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        orderId?: unknown;
        items?: FoldedItem[];
        totalCents?: unknown;
        error?: unknown;
      } | null;

      if (!res.ok) {
        return errorResult(
          typeof data?.error === 'string' ? data.error : `order failed with status ${res.status}`,
        );
      }
      if (data === null || typeof data.orderId !== 'string' || !Array.isArray(data.items)) {
        return errorResult(`order service returned an unexpected response (status ${res.status})`);
      }
      return {
        content: [
          {
            type: 'text',
            text: formatOrderText(
              data.orderId,
              data.items,
              folded.deliveryDate,
              typeof data.totalCents === 'number' ? data.totalCents : 0,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'unknown error');
    }
  };
}

// --- registration --------------------------------------------------------------

async function fetchPublishedTools(): Promise<TaughtTool[]> {
  const res = await fetch('/api/tools');
  if (!res.ok) throw new Error(`failed to load tools (status ${res.status})`);
  const data = (await res.json()) as { tools?: TaughtTool[] };
  return Array.isArray(data.tools) ? data.tools : [];
}

/**
 * Load published tools and (re)register them. Always repopulates the shared
 * registry (apprentice fallback uses the SAME execute); registers with
 * document.modelContext when the runtime exists. real=true means a live WebMCP
 * runtime received the tools. Dynamic: call again to pick up new tools — no
 * page reload needed.
 */
export async function registerAllTools(): Promise<{ registered: number; real: boolean }> {
  const tools = await fetchPublishedTools();
  const modelContext = getModelContext();

  registry.length = 0; // replace, never duplicate
  for (const tool of tools) {
    const entry: ToolRegistryEntry = { tool, execute: buildExecute(tool) };
    registry.push(entry);
    if (modelContext) {
      try {
        modelContext.registerTool({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          execute: entry.execute,
        });
      } catch (err) {
        // e.g. runtime rejects a duplicate name after refresh — the in-app
        // registry still has the latest version, so execution keeps working
        debugLog('runtime rejected registration for', tool.name, err);
      }
    }
  }

  debugLog(
    `registered ${registry.length} tool(s)`,
    modelContext ? 'via document.modelContext' : 'in-app registry only (no WebMCP runtime)',
  );
  return { registered: registry.length, real: modelContext !== null };
}

/** Single entry point for executing a registered tool by name (Task 8 seam). */
export async function executeToolFromRegistry(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const entry = registry.find((candidate) => candidate.tool.name === name);
  if (!entry) throw new Error(`tool "${name}" is not registered`);
  return entry.execute(args);
}
