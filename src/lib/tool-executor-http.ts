import { substituteArgs, type InputSchema } from './placeholders';
import {
  foldSteps,
  formatOrderResultText,
  type FoldCatalogItem,
  type FoldedItem,
} from './tool-executor';
import type { TaughtTool } from './types';

/**
 * THE single tool-execute path (R5, hardened): one factory powers BOTH surfaces
 * of the agent seam — the browser WebMCP bridge (baseUrl '' → relative URLs)
 * and the server-side apprentice (baseUrl = request origin) — so there is
 * exactly one order-creation flow: substituteArgs (ajv) → foldSteps →
 * POST {baseUrl}/api/orders (channel 'agent'). No module here touches the db:
 * the only write path for orders remains the /api/orders route.
 *
 * Failure contract: the executor THROWS with the readable message the surface
 * should surface (webmcp wraps it into an isError CallToolResult; the
 * apprentice loop feeds it back to the model as the tool result text).
 */

// --- untrusted-input clamp ------------------------------------------------------

// LLM/runtime-supplied tool args are untrusted: clamp BEFORE validation.
export const MAX_ARG_STRING = 500; // mirrors MAX_STRING in src/lib/orders.ts
export const MAX_ARG_ARRAY = 50;
export const MAX_ARG_DEPTH = 3;

const FORBIDDEN_ARG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clampValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_ARG_STRING ? value.slice(0, MAX_ARG_STRING) : value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  if (depth >= MAX_ARG_DEPTH) return null; // nested too deep → dropped
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARG_ARRAY).map((entry) => clampValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_ARG_KEYS.has(key)) continue; // prototype-pollution guard
      out[key] = clampValue(entry, depth + 1);
    }
    return out;
  }
  return null; // functions/symbols/anything exotic → dropped
}

/**
 * Tool args come from LLM output = untrusted; clamp them BEFORE schema
 * validation: every string truncated to MAX_ARG_STRING chars, arrays capped at
 * MAX_ARG_ARRAY entries, objects nested at most MAX_ARG_DEPTH levels, and
 * prototype-pollution keys dropped. substituteArgs (ajv) and the orders route
 * revalidate everything downstream — this pure clamp guarantees bounded input
 * reaches them, which also makes the taint boundary self-evident to scanners:
 * no unbounded LLM value can flow into order creation.
 */
export function clampToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const clamped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (FORBIDDEN_ARG_KEYS.has(key)) continue;
    clamped[key] = clampValue(value, 1);
  }
  return clamped;
}

// --- the shared executor ---------------------------------------------------------

export interface CreateToolExecutorOptions {
  /** '' → relative URLs (browser bridge); e.g. 'http://localhost:3000' server-side. */
  baseUrl: string;
  tools: TaughtTool[];
  /** Pre-fetched fold catalog; when omitted the executor GETs {baseUrl}/api/catalog. */
  catalog?: FoldCatalogItem[];
  fetchImpl?: typeof globalThis.fetch;
}

interface CatalogEntry {
  sku: string;
  name: string;
}

async function fetchCatalog(
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<CatalogEntry[]> {
  const res = await fetchImpl(`${baseUrl}/api/catalog`);
  if (!res.ok) throw new Error(`failed to load catalog (status ${res.status})`);
  const data = (await res.json().catch(() => null)) as { items?: CatalogEntry[] } | null;
  if (!Array.isArray(data?.items)) throw new Error('catalog response is malformed');
  return data.items;
}

/**
 * Build an executor for the given taught tools. Success resolves with the
 * shared order-confirmation text (formatOrderResultText over the SERVER's
 * authoritative response); any failure throws with a readable message:
 * schema violations (ajv), unknown/invalid fold steps, catalog failures, or
 * orders-API rejections — byte-compatible with the original webmcp
 * buildExecute strings.
 */
export function createToolExecutor(
  opts: CreateToolExecutorOptions,
): (name: string, args: Record<string, unknown>) => Promise<string> {
  const { baseUrl, tools } = opts;
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  return async (name, rawArgs) => {
    const tool = toolByName.get(name);
    if (!tool) throw new Error(`tool "${name}" is not registered`);
    // tool args come from LLM output = untrusted; clamped before schema
    // validation, which also satisfies taint analysis that args are bounded
    // before reaching order creation
    const args = clampToolArgs(rawArgs);
    try {
      // ajv-validated placeholder substitution, then fold resolved steps into
      // the order draft — identical semantics on both surfaces
      const steps = substituteArgs(tool.steps, args, tool.inputSchema as InputSchema);
      const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
      const catalog = opts.catalog ?? (await fetchCatalog(baseUrl, fetchImpl));
      const folded = foldSteps(steps, catalog);

      const res = await fetchImpl(`${baseUrl}/api/orders`, {
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
        throw new Error(
          typeof data?.error === 'string' ? data.error : `order failed with status ${res.status}`,
        );
      }
      if (data === null || typeof data.orderId !== 'string' || !Array.isArray(data.items)) {
        throw new Error(`order service returned an unexpected response (status ${res.status})`);
      }
      // the server's authoritative response quotes the order (no duplicated pricing)
      return formatOrderResultText(
        data.orderId,
        data.items,
        folded.deliveryDate,
        typeof data.totalCents === 'number' ? data.totalCents : 0,
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  };
}
