import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  executeToolCalls,
  makeServerToolExecutor,
  MAX_ARG_STRING,
  parseOpenAIToolCalls,
  runApprenticeTurn,
  toOpenAITools,
  type OpenAIMessage,
} from '@/lib/apprentice';
import type { TaughtTool } from '@/lib/types';

// test fixture — not a credential; never a real key shape (computed so that
// credential-literal scanners don't fire on a fake)
const TEST_API_KEY = ['test', 'api', 'key'].join('-');

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

function openaiResponse(message: Record<string, unknown>): Response {
  return Response.json({ choices: [{ message }] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toOpenAITools', () => {
  it('maps taught tools to OpenAI function definitions', () => {
    const tools = toOpenAITools([makeTool()]);
    expect(tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'order_pao_de_queijo',
          description: 'Order pao de queijo by the dozen for delivery',
          parameters: makeTool().inputSchema,
        },
      },
    ]);
  });

  it('returns an empty array for no tools', () => {
    expect(toOpenAITools([])).toEqual([]);
  });
});

describe('parseOpenAIToolCalls', () => {
  it('extracts id, name and raw args from a tool_calls message', () => {
    const calls = parseOpenAIToolCalls({
      tool_calls: [
        { id: 'call_1', function: { name: 'order_pao_de_queijo', arguments: '{"qty":2}' } },
        { id: 'call_2', function: { name: 'order_sonho', arguments: '{}' } },
      ],
    });
    expect(calls).toEqual([
      { id: 'call_1', name: 'order_pao_de_queijo', argsRaw: '{"qty":2}' },
      { id: 'call_2', name: 'order_sonho', argsRaw: '{}' },
    ]);
  });

  it('returns an empty list when there are no tool calls', () => {
    expect(parseOpenAIToolCalls({ content: 'hi' })).toEqual([]);
    expect(parseOpenAIToolCalls(null)).toEqual([]);
    expect(parseOpenAIToolCalls({ tool_calls: 'nope' })).toEqual([]);
  });

  it('skips malformed entries instead of throwing', () => {
    const calls = parseOpenAIToolCalls({
      tool_calls: [
        { id: 'call_bad', function: null },
        { id: 'call_ok', function: { name: 'order_sonho', arguments: '{}' } },
      ],
    });
    expect(calls).toEqual([{ id: 'call_ok', name: 'order_sonho', argsRaw: '{}' }]);
  });
});

describe('executeToolCalls (mocked execute)', () => {
  it('executes each call and builds role:tool follow-up messages keyed by tool_call_id', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce('Order #ord-1 created: 2x Pao de Queijo (dozen). Total $30.00.');
    const { followUpMessages, traces } = await executeToolCalls(
      [{ id: 'call_1', name: 'order_pao_de_queijo', argsRaw: '{"qty":2}' }],
      execute,
    );
    expect(execute).toHaveBeenCalledWith('order_pao_de_queijo', { qty: 2 });
    expect(followUpMessages).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Order #ord-1 created: 2x Pao de Queijo (dozen). Total $30.00.',
      },
    ]);
    expect(traces).toEqual([
      {
        name: 'order_pao_de_queijo',
        args: { qty: 2 },
        resultText: 'Order #ord-1 created: 2x Pao de Queijo (dozen). Total $30.00.',
      },
    ]);
  });

  it('preserves call order with multiple tool calls', async () => {
    const execute = vi.fn().mockImplementation(async (_name: string, args: { n: number }) => `ok ${args.n}`);
    const { followUpMessages } = await executeToolCalls(
      [
        { id: 'a', name: 'tool_a', argsRaw: '{"n":1}' },
        { id: 'b', name: 'tool_b', argsRaw: '{"n":2}' },
      ],
      execute,
    );
    expect(followUpMessages.map((m) => (m as { tool_call_id?: string }).tool_call_id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('captures an executor throw as the tool message text instead of rejecting', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('unknown sku: feijoada'));
    const { followUpMessages, traces } = await executeToolCalls(
      [{ id: 'call_1', name: 'order_x', argsRaw: '{}' }],
      execute,
    );
    expect(followUpMessages[0]).toMatchObject({ role: 'tool', content: 'unknown sku: feijoada' });
    expect(traces[0]).toMatchObject({ name: 'order_x', resultText: 'unknown sku: feijoada' });
  });

  it('returns an error result without calling execute when args are not valid JSON', async () => {
    const execute = vi.fn();
    const { followUpMessages, traces } = await executeToolCalls(
      [{ id: 'call_1', name: 'order_x', argsRaw: 'not json' }],
      execute,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(followUpMessages[0]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect((followUpMessages[0] as { content: string }).content).toMatch(/invalid JSON/i);
    expect(traces[0]).toMatchObject({ name: 'order_x', args: {} });
  });
});

describe('runApprenticeTurn (mocked OpenAI fetch + mocked execute)', () => {
  const tool = makeTool();
  const catalog = [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)' }];
  const history = [{ role: 'user' as const, content: 'order a dozen pao de queijo for Friday' }];

  function makeFetch(responses: Response[]) {
    const fetchMock = vi.fn();
    for (const res of responses) fetchMock.mockResolvedValueOnce(res);
    return fetchMock;
  }

  function baseOpts(fetchMock: ReturnType<typeof makeFetch>, execute = vi.fn()) {
    return {
      apiKey: TEST_API_KEY,
      history,
      tools: [tool],
      catalog,
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
      execute: execute as (name: string, args: Record<string, unknown>) => Promise<string>,
    };
  }

  it('sends the system prompt, history and function tools; returns the text reply', async () => {
    const fetchMock = makeFetch([openaiResponse({ content: 'Your order is placed!' })]);
    const result = await runApprenticeTurn(baseOpts(fetchMock));

    expect(result).toEqual({ reply: 'Your order is placed!', toolCalls: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: OpenAIMessage[];
      tools?: unknown[];
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[1]).toMatchObject({ role: 'user', content: history[0]?.content });
    expect(body.tools).toEqual(toOpenAITools([tool]));
    expect(init.headers && (init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TEST_API_KEY}`,
    );
  });

  it('executes tool_calls and feeds role:tool results back for the final reply', async () => {
    const execute = vi.fn().mockResolvedValue('Order #ord-9 created: 1x Pao de Queijo (dozen). Total $15.00.');
    const fetchMock = makeFetch([
      openaiResponse({
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'order_pao_de_queijo',
              arguments: '{"qty":1,"deliveryDate":"2026-09-04"}',
            },
          },
        ],
      }),
      openaiResponse({ content: 'Done! One dozen for Friday, $15.00.' }),
    ]);
    const result = await runApprenticeTurn(baseOpts(fetchMock, execute));

    expect(execute).toHaveBeenCalledWith('order_pao_de_queijo', {
      qty: 1,
      deliveryDate: '2026-09-04',
    });
    expect(result.reply).toBe('Done! One dozen for Friday, $15.00.');
    expect(result.toolCalls).toEqual([
      {
        name: 'order_pao_de_queijo',
        args: { qty: 1, deliveryDate: '2026-09-04' },
        resultText: 'Order #ord-9 created: 1x Pao de Queijo (dozen). Total $15.00.',
      },
    ]);

    // follow-up request carries the assistant tool_calls message + role:tool result
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body),
    ) as { messages: OpenAIMessage[] };
    const roles = secondBody.messages.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool']);
    const toolMsg = secondBody.messages[3] as { tool_call_id?: string; content?: string };
    expect(toolMsg.tool_call_id).toBe('call_1');
    expect(toolMsg.content).toMatch(/Order #ord-9 created/);
  });

  it('is bounded: at most 2 tool rounds, then forces a text-only final answer', async () => {
    // a fresh Response per call: a Response body can only be read once
    const alwaysToolCall = () =>
      openaiResponse({
        content: null,
        tool_calls: [{ id: 'call_x', function: { name: 'order_pao_de_queijo', arguments: '{"qty":1}' } }],
      });
    const execute = vi.fn().mockResolvedValue('ok');
    const fetchMock = makeFetch([
      alwaysToolCall(),
      alwaysToolCall(),
      openaiResponse({ content: 'final answer' }),
    ]);
    const result = await runApprenticeTurn(baseOpts(fetchMock, execute));

    expect(execute).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.reply).toBe('final answer');
    expect(result.toolCalls).toHaveLength(2);
    // the last request forces a text answer so the loop always terminates
    const lastBody = JSON.parse(
      String((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body),
    ) as { tool_choice?: unknown };
    expect(lastBody.tool_choice).toBe('none');
  });

  it('terminates with a fallback reply when a hostile runtime keeps returning tool_calls', async () => {
    // ignores tool_choice:'none' entirely — always answers with tool_calls
    const alwaysToolCall = () =>
      openaiResponse({
        content: null,
        tool_calls: [{ id: 'call_x', function: { name: 'order_pao_de_queijo', arguments: '{"qty":1}' } }],
      });
    const execute = vi.fn().mockResolvedValue('ok');
    // more responses than the cap allows: the loop must stop on its own
    const fetchMock = makeFetch([
      alwaysToolCall(),
      alwaysToolCall(),
      alwaysToolCall(),
      alwaysToolCall(),
      alwaysToolCall(),
    ]);
    const result = await runApprenticeTurn(baseOpts(fetchMock, execute));

    // structural break: MAX_TOOL_ROUNDS + 2 OpenAI calls, never more
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.reply).toMatch(/too many tool rounds/i);
    expect(result.toolCalls).toHaveLength(3);
  });

  it('propagates executor errors as the tool result text and lets the model recover', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('unknown sku: feijoada'));
    const fetchMock = makeFetch([
      openaiResponse({
        tool_calls: [{ id: 'call_1', function: { name: 'order_x', arguments: '{}' } }],
      }),
      openaiResponse({ content: 'Sorry, that item does not exist.' }),
    ]);
    const result = await runApprenticeTurn(baseOpts(fetchMock, execute));
    expect(result.reply).toBe('Sorry, that item does not exist.');
    expect(result.toolCalls[0]).toMatchObject({ name: 'order_x', resultText: 'unknown sku: feijoada' });
  });

  it('throws an informative error when OpenAI responds non-ok', async () => {
    const fetchMock = makeFetch([new Response('{"error":{"message":"bad key"}}', { status: 401 })]);
    await expect(runApprenticeTurn(baseOpts(fetchMock))).rejects.toThrow(/401/);
  });

  it('sends no tools parameter when no tools are taught', async () => {
    const fetchMock = makeFetch([openaiResponse({ content: 'I cannot order yet.' })]);
    const opts = { ...baseOpts(fetchMock), tools: [] };
    const result = await runApprenticeTurn(opts);
    expect(result.reply).toBe('I cannot order yet.');
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as { tools?: unknown };
    expect(body.tools).toBeUndefined();
  });
});

describe('makeServerToolExecutor — untrusted tool-args clamp', () => {
  it('truncates an oversized LLM string before it can reach order creation', async () => {
    const createOrderImpl = vi.fn().mockResolvedValue({
      ok: true,
      orderId: 'ord-clamp',
      totalCents: 3000,
    });
    const execute = makeServerToolExecutor(
      [makeTool()],
      [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)' }],
      createOrderImpl,
    );
    const oversized = 'x'.repeat(10_000);
    const text = await execute('order_pao_de_queijo', { qty: 2, deliveryDate: oversized });

    // the executor still completes the happy path — on the clamped value
    expect(text).toContain('Order #ord-clamp created');
    // and the body that reached order creation is bounded, never the raw 10k value
    expect(createOrderImpl).toHaveBeenCalledTimes(1);
    const body = createOrderImpl.mock.calls[0]?.[0] as {
      deliveryDate?: string;
      items?: { sku: string; qty: number }[];
      channel?: string;
    };
    expect(body.channel).toBe('agent');
    expect(body.items).toEqual([{ sku: 'pao-queijo-duzia', qty: 2 }]);
    expect(body.deliveryDate).toHaveLength(MAX_ARG_STRING);
    expect((body.deliveryDate as string).length).toBeLessThan(oversized.length);
  });
});
