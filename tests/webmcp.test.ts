import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildExecute,
  executeToolFromRegistry,
  foldSteps,
  getModelContext,
  getRegistry,
  registerAllTools,
  type FoldCatalogItem,
} from '@/lib/webmcp';
import { POST as postTools } from '@/app/api/tools/route';
import type { CompiledTool, TaughtTool } from '@/lib/types';

const catalog: FoldCatalogItem[] = [
  { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)' },
  { sku: 'sonho', name: 'Sonho (2-pack)' },
];

function makeCompiled(overrides?: Partial<CompiledTool>): CompiledTool {
  return {
    name: 'order_pao_de_queijo',
    description: 'Order pao de queijo by the dozen for delivery',
    inputSchema: {
      type: 'object',
      properties: {
        qty: { type: 'number', default: 1 },
        deliveryDate: { type: 'string' },
      },
      required: ['qty'],
    },
    steps: [
      { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: '{{qty}}' } },
      { intent: 'set_delivery', params: { date: '{{deliveryDate}}' } },
    ],
    ...overrides,
  };
}

function makeTool(overrides?: Partial<TaughtTool>): TaughtTool {
  return {
    id: 'tool-1',
    store_id: 'store-1',
    published: true,
    created_at: '2026-08-28T00:00:00.000Z',
    ...makeCompiled(),
    ...overrides,
  };
}

function postToolBody(tool: unknown): Request {
  return new Request('http://localhost/api/tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('foldSteps', () => {
  it('accumulates qty for multiple add_item of the same sku', () => {
    const folded = foldSteps(
      [
        { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 2 } },
        { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 1 } },
      ],
      catalog,
    );
    expect(folded).toEqual({
      items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 3 }],
      deliveryDate: null,
      note: null,
    });
  });

  it('keeps distinct skus as separate items in first-seen order', () => {
    const folded = foldSteps(
      [
        { intent: 'add_item', params: { sku: 'sonho', qty: 1 } },
        { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 2 } },
        { intent: 'add_item', params: { sku: 'sonho', qty: 1 } },
      ],
      catalog,
    );
    expect(folded.items).toEqual([
      { sku: 'sonho', name: 'Sonho (2-pack)', qty: 2 },
      { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 2 },
    ]);
  });

  it('coerces string qty values to numbers', () => {
    const folded = foldSteps(
      [
        { intent: 'add_item', params: { sku: 'sonho', qty: '2' } },
        { intent: 'add_item', params: { sku: 'sonho', qty: '1' } },
      ],
      catalog,
    );
    expect(folded.items[0]?.qty).toBe(3);
  });

  it('overwrites deliveryDate and note on repeated set_delivery/set_note', () => {
    const folded = foldSteps(
      [
        { intent: 'set_delivery', params: { date: '2026-09-01' } },
        { intent: 'set_note', params: { text: 'ring twice' } },
        { intent: 'set_delivery', params: { date: '2026-09-05' } },
        { intent: 'set_note', params: { text: 'extra warm' } },
      ],
      catalog,
    );
    expect(folded.deliveryDate).toBe('2026-09-05');
    expect(folded.note).toBe('extra warm');
  });

  it('ignores view_item and confirm_order steps', () => {
    const folded = foldSteps(
      [
        { intent: 'view_item', params: { sku: 'sonho' } },
        { intent: 'confirm_order', params: { items: '["x"]' } },
      ],
      catalog,
    );
    expect(folded).toEqual({ items: [], deliveryDate: null, note: null });
  });

  it('throws Error("unknown sku: <sku>") for a sku outside the catalog', () => {
    expect(() =>
      foldSteps([{ intent: 'add_item', params: { sku: 'feijoada', qty: 1 } }], catalog),
    ).toThrow(Error('unknown sku: feijoada'));
  });

  it('folds an empty step list to an empty order', () => {
    expect(foldSteps([], catalog)).toEqual({ items: [], deliveryDate: null, note: null });
  });
});

describe('getModelContext', () => {
  it('returns null when document.modelContext is absent (plain browser/node)', () => {
    expect(getModelContext()).toBeNull();
  });

  it('feature-detects document.modelContext with a registerTool function', () => {
    const registerTool = vi.fn();
    vi.stubGlobal('document', { modelContext: { registerTool } });
    const mc = getModelContext();
    expect(mc).not.toBeNull();
    mc?.registerTool({ name: 'x' });
    expect(registerTool).toHaveBeenCalledWith({ name: 'x' });
  });

  it('returns null when modelContext exists but registerTool is not a function', () => {
    vi.stubGlobal('document', { modelContext: { registerTool: 'nope' } });
    expect(getModelContext()).toBeNull();
  });
});

describe('registerAllTools / getRegistry / executeToolFromRegistry', () => {
  const tools = [makeTool({ id: 't1' }), makeTool({ id: 't2', name: 'order_sonho' })];

  function stubFetch(opts?: { orders?: Response; catalogMissingSku?: boolean }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/tools') return Response.json({ tools });
      if (url === '/api/catalog') {
        const items = opts?.catalogMissingSku
          ? [{ sku: 'something-else', name: 'Other', price_cents: 100 }]
          : [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', price_cents: 1500 }];
        return Response.json({ ok: true, items });
      }
      if (url === '/api/orders') {
        if (opts?.orders) return opts.orders;
        return Response.json(
          {
            orderId: 'ord-9',
            items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 2, price_cents: 1500 }],
            totalCents: 3000,
          },
          { status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it('returns real:false and still populates the shared registry (apprentice fallback)', async () => {
    vi.stubGlobal('fetch', stubFetch());
    const { registered, real } = await registerAllTools();
    expect(registered).toBe(2);
    expect(real).toBe(false);
    expect(getRegistry().map((entry) => entry.tool.id)).toEqual(['t1', 't2']);
    expect(typeof getRegistry()[0]?.execute).toBe('function');
  });

  it('replaces registry contents on re-registration (no duplicates)', async () => {
    vi.stubGlobal('fetch', stubFetch());
    await registerAllTools();
    await registerAllTools();
    expect(getRegistry()).toHaveLength(2);
  });

  it('registers into document.modelContext when available and reports real:true', async () => {
    const registerTool = vi.fn();
    vi.stubGlobal('fetch', stubFetch());
    vi.stubGlobal('document', { modelContext: { registerTool } });
    const { registered, real } = await registerAllTools();
    expect(real).toBe(true);
    expect(registered).toBe(2);
    expect(registerTool).toHaveBeenCalledTimes(2);
    const first = registerTool.mock.calls[0]?.[0] as { name: string; execute: unknown };
    expect(first.name).toBe('order_pao_de_queijo');
    expect(typeof first.execute).toBe('function');
  });

  it('executeToolFromRegistry resolves by name and runs the shared execute path', async () => {
    vi.stubGlobal('fetch', stubFetch());
    await registerAllTools();
    const result = await executeToolFromRegistry('order_pao_de_queijo', {
      qty: 2,
      deliveryDate: '2026-09-05',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: 'Order #ord-9 created: 2x Pao de Queijo (dozen), deliver 2026-09-05. Total $30.00.' },
    ]);
  });

  it('executeToolFromRegistry throws for a name that is not registered', async () => {
    vi.stubGlobal('fetch', stubFetch());
    await registerAllTools();
    await expect(executeToolFromRegistry('nope', {})).rejects.toThrow(/nope/);
  });
});

describe('buildExecute (shared execute path)', () => {
  function stubFetch(opts?: { orderStatus?: number; orderBody?: unknown; catalogMissingSku?: boolean }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/catalog') {
        const items = opts?.catalogMissingSku
          ? [{ sku: 'something-else', name: 'Other', price_cents: 100 }]
          : [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', price_cents: 1500 }];
        return Response.json({ ok: true, items });
      }
      if (url === '/api/orders') {
        const status = opts?.orderStatus ?? 201;
        const body = opts?.orderBody ?? {
          orderId: 'ord-1',
          items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 3, price_cents: 1500 }],
          totalCents: 4500,
        };
        return Response.json(body, { status });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it('substitutes args, folds, POSTs channel:agent and returns the CallToolResult text', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const execute = buildExecute(makeTool());
    const result = await execute({ qty: 3, deliveryDate: '2026-09-05' });
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Order #ord-1 created: 3x Pao de Queijo (dozen), deliver 2026-09-05. Total $45.00.' },
      ],
    });
    // fetch is called with (url, init) at runtime even though the stub only
    // binds the first arg, so widen the recorded call tuples for the assertion
    const ordersCall = (
      fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit | undefined]>
    ).find(([input]) => String(input) === '/api/orders');
    const body = JSON.parse(String(ordersCall?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      channel: 'agent',
      toolName: 'order_pao_de_queijo',
      items: [{ sku: 'pao-queijo-duzia', qty: 3 }],
      deliveryDate: '2026-09-05',
    });
  });

  it('returns isError:true when args fail the input schema (no requests sent)', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const execute = buildExecute(makeTool());
    const result = await execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/qty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns isError:true on unknown sku after folding', async () => {
    vi.stubGlobal('fetch', stubFetch({ catalogMissingSku: true }));
    const execute = buildExecute(makeTool());
    const result = await execute({ qty: 1, deliveryDate: '2026-09-05' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('unknown sku: pao-queijo-duzia');
  });

  it('returns isError:true when the orders API rejects the order', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ orderStatus: 400, orderBody: { ok: false, error: 'deliveryDate must be a valid YYYY-MM-DD date' } }),
    );
    const execute = buildExecute(makeTool());
    const result = await execute({ qty: 1, deliveryDate: 'not-a-date' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/deliveryDate/);
  });
});

describe('POST /api/tools — request validation (no DB touched)', () => {
  it('rejects steps: [] with 400 (T6 review carry-in)', async () => {
    const res = await postTools(postToolBody(makeCompiled({ steps: [] })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/steps/i);
  });

  it('rejects a tool that fails validateTool with 400', async () => {
    const res = await postTools(postToolBody(makeCompiled({ name: 'Bad Name' })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/name/i);
  });

  it('rejects a body without a tool object with 400', async () => {
    const res = await postTools(
      new Request('http://localhost/api/tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nope: true }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
