import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildExecute } from '@/lib/webmcp';
import {
  clampToolArgs,
  createToolExecutor,
  MAX_ARG_STRING,
} from '@/lib/tool-executor-http';
import type { TaughtTool } from '@/lib/types';

const catalog = [
  { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', price_cents: 1500 },
  { sku: 'sonho', name: 'Sonho (2-pack)', price_cents: 900 },
];

function makeTool(overrides?: Partial<TaughtTool>): TaughtTool {
  return {
    id: 'tool-1',
    store_id: 'store-1',
    published: true,
    created_at: '2026-08-28T00:00:00.000Z',
    name: 'order_pao_de_queijo',
    description: 'Order pao de queijo by the dozen for delivery',
    inputSchema: {
      type: 'object',
      properties: { qty: { type: 'number', default: 1 }, deliveryDate: { type: 'string' } },
      required: ['qty'],
    },
    steps: [
      { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: '{{qty}}' } },
      { intent: 'set_delivery', params: { date: '{{deliveryDate}}' } },
    ],
    ...overrides,
  };
}

const orderResponse = () =>
  Response.json(
    {
      orderId: 'ord-1',
      items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 2, price_cents: 1500 }],
      totalCents: 3000,
    },
    { status: 201 },
  );

const catalogResponse = () => Response.json({ ok: true, items: catalog });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createToolExecutor — the ONE execute path', () => {
  it('GETs {baseUrl}/api/catalog when no catalog is provided, then POSTs the exact orders body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce(orderResponse());
    const execute = createToolExecutor({
      baseUrl: 'http://srv.test',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    const text = await execute('order_pao_de_queijo', { qty: 2, deliveryDate: '2026-09-05' });

    // server-authoritative success text
    expect(text).toBe(
      'Order #ord-1 created: 2x Pao de Queijo (dozen), deliver 2026-09-05. Total $30.00.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://srv.test/api/catalog');
    const [ordersUrl, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(ordersUrl).toBe('http://srv.test/api/orders');
    // EXACT body shape — identical to what webmcp buildExecute POSTs
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ sku: 'pao-queijo-duzia', qty: 2 }],
      deliveryDate: '2026-09-05',
      channel: 'agent',
      toolName: 'order_pao_de_queijo',
    });
  });

  it('skips the catalog GET when a catalog is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(orderResponse());
    const execute = createToolExecutor({
      baseUrl: '',
      tools: [makeTool()],
      catalog,
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await execute('order_pao_de_queijo', { qty: 1, deliveryDate: '2026-09-05' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/orders');
  });

  it('rejects unknown tool names without any request', async () => {
    const fetchMock = vi.fn();
    const execute = createToolExecutor({
      baseUrl: '',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(execute('nope', {})).rejects.toThrow('tool "nope" is not registered');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects schema violations before any request (ajv message)', async () => {
    const fetchMock = vi.fn();
    const execute = createToolExecutor({
      baseUrl: '',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(execute('order_pao_de_queijo', {})).rejects.toThrow(/qty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('produces readable error strings for catalog failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const execute = createToolExecutor({
      baseUrl: 'http://srv.test',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(
      execute('order_pao_de_queijo', { qty: 1, deliveryDate: '2026-09-05' }),
    ).rejects.toThrow('failed to load catalog (status 500)');
  });

  it('surfaces the orders API error message on non-ok responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce(
        Response.json({ ok: false, error: 'deliveryDate must be a valid YYYY-MM-DD date' }, { status: 400 }),
      );
    const execute = createToolExecutor({
      baseUrl: '',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(execute('order_pao_de_queijo', { qty: 1, deliveryDate: 'friday' })).rejects.toThrow(
      'deliveryDate must be a valid YYYY-MM-DD date',
    );
  });

  it('rejects a malformed success payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce(Response.json({ unexpected: true }, { status: 201 }));
    const execute = createToolExecutor({
      baseUrl: '',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(
      execute('order_pao_de_queijo', { qty: 1, deliveryDate: '2026-09-05' }),
    ).rejects.toThrow('order service returned an unexpected response (status 201)');
  });
});

describe('createToolExecutor — untrusted tool-args clamp', () => {
  it('truncates an oversized LLM string before it can reach order creation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse())
      .mockResolvedValueOnce(orderResponse());
    const execute = createToolExecutor({
      baseUrl: 'http://srv.test',
      tools: [makeTool()],
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    const oversized = 'x'.repeat(10_000);
    const text = await execute('order_pao_de_queijo', { qty: 2, deliveryDate: oversized });

    // the executor still completes the happy path — on the clamped value
    expect(text).toContain('Order #ord-1 created');
    // and the body that reached the orders API is bounded, never the raw 10k value
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { deliveryDate?: string };
    expect(body.deliveryDate).toHaveLength(MAX_ARG_STRING);
    expect((body.deliveryDate as string).length).toBeLessThan(oversized.length);
  });

  it('clampToolArgs is a pure bounded deep-clamp', () => {
    expect(clampToolArgs({ s: 'y'.repeat(600) }).s).toHaveLength(MAX_ARG_STRING);
    const arr = clampToolArgs({ list: Array.from({ length: 60 }, (_, i) => i) }) as {
      list: unknown[];
    };
    expect(arr.list).toHaveLength(50);
    expect(clampToolArgs({ __proto__: { evil: true }, a: 1 })).toEqual({ a: 1 });
  });
});

describe('parity — browser bridge and server executor POST identically', () => {
  const ARGS = { qty: 2, deliveryDate: '2026-09-05' };

  it('buildExecute and createToolExecutor(baseUrl=origin) send the same orders body', async () => {
    const captured: string[] = [];
    const makeFetch = () =>
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/catalog')) return catalogResponse();
        captured.push(String(init?.body));
        return orderResponse();
      });

    const browserFetch = makeFetch();
    vi.stubGlobal('fetch', browserFetch);
    // buildExecute returns the CallToolResult (text wrapped) — extract the text
    const browserResult = await buildExecute(makeTool())(ARGS);
    const browserText = browserResult.content[0]?.text as string;
    expect(browserResult.isError).toBeUndefined();

    const serverFetch = makeFetch();
    const serverText = await createToolExecutor({
      baseUrl: 'http://srv.test',
      tools: [makeTool()],
      fetchImpl: serverFetch as unknown as typeof globalThis.fetch,
    })('order_pao_de_queijo', ARGS);

    // identical result text and an identical POST body
    expect(serverText).toBe(browserText);
    expect(captured).toHaveLength(2);
    expect(JSON.parse(captured[0]!)).toEqual(JSON.parse(captured[1]!));
    // and the server executor targeted its own origin over HTTP
    expect(String(browserFetch.mock.calls.find(([u]) => String(u) === '/api/orders')?.[0])).toBe(
      '/api/orders',
    );
    expect(String(serverFetch.mock.calls.find(([u]) => String(u).endsWith('/api/orders'))?.[0])).toBe(
      'http://srv.test/api/orders',
    );
  });
});
