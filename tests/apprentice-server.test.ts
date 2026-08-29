import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleApprenticeTurn, parseHistory } from '@/lib/apprentice-server';

const hadOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (hadOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = hadOpenAiKey;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const OPENAI = 'https://api.openai.com/v1/chat/completions';
const ORIGIN = 'http://local.test';

const publishedTool = {
  id: 't1',
  store_id: 's1',
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
  published: true,
  created_at: '2026-08-28T00:00:00.000Z',
};

describe('handleApprenticeTurn — security boundary', () => {
  it('throws the friendly missing-key error before ANY fetch (tools included)', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      handleApprenticeTurn([{ role: 'user', content: 'order a dozen pao de queijo' }], ORIGIN),
    ).rejects.toThrow('OPENAI_API_KEY is not configured on the server');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consumes the public tools list via HTTP and executes tools over the same origin', async () => {
    process.env.OPENAI_API_KEY = 'test-env-key';
    const requestedUrls: string[] = [];
    let openaiCalls = 0;
    const orderBodies: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === `${ORIGIN}/api/tools`) {
        return Response.json({ tools: [publishedTool] });
      }
      if (url === `${ORIGIN}/api/catalog`) {
        return Response.json({
          ok: true,
          items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', price_cents: 1500 }],
        });
      }
      if (url === `${ORIGIN}/api/orders`) {
        orderBodies.push(String(init?.body));
        return Response.json(
          {
            orderId: 'ord-9',
            items: [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 1, price_cents: 1500 }],
            totalCents: 1500,
          },
          { status: 201 },
        );
      }
      if (url === OPENAI) {
        openaiCalls += 1;
        if (openaiCalls === 1) {
          return Response.json({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'order_pao_de_queijo',
                        arguments: '{"qty":1,"deliveryDate":"2026-09-05"}',
                      },
                    },
                  ],
                },
              },
            ],
          });
        }
        return Response.json({ choices: [{ message: { content: 'Done!' } }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleApprenticeTurn(
      [{ role: 'user', content: 'order a dozen pao de queijo for Friday' }],
      ORIGIN,
    );
    // the tool result fed back to the model quotes the HTTP orders response
    expect(result.reply).toBe('Done!');
    expect(result.toolCalls).toEqual([
      {
        name: 'order_pao_de_queijo',
        args: { qty: 1, deliveryDate: '2026-09-05' },
        resultText: 'Order #ord-9 created: 1x Pao de Queijo (dozen), deliver 2026-09-05. Total $15.00.',
      },
    ]);
    // every network hop is HTTP against the origin — no db anywhere in the loop:
    // tools list → OpenAI → catalog GET + orders POST → OpenAI final reply
    expect(requestedUrls).toEqual([
      `${ORIGIN}/api/tools`,
      OPENAI,
      `${ORIGIN}/api/catalog`,
      `${ORIGIN}/api/orders`,
      OPENAI,
    ]);
    // the POST body that left the process matches the browser-bridge shape
    expect(JSON.parse(orderBodies[0] ?? '{}')).toEqual({
      items: [{ sku: 'pao-queijo-duzia', qty: 1 }],
      deliveryDate: '2026-09-05',
      channel: 'agent',
      toolName: 'order_pao_de_queijo',
    });
  });

  it('propagates a tools-fetch failure as a readable error', async () => {
    process.env.OPENAI_API_KEY = 'test-env-key';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === `${ORIGIN}/api/tools`) {
        return new Response('db down', { status: 500 });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      handleApprenticeTurn([{ role: 'user', content: 'hi' }], ORIGIN),
    ).rejects.toThrow('failed to load tools (status 500)');
  });
});

describe('parseHistory — byte-compatible request validation contract', () => {
  it('rejects a non-object body', () => {
    expect(parseHistory(null)).toEqual({ ok: false, error: 'body must be a JSON object' });
  });

  it('rejects empty/non-array messages', () => {
    expect(parseHistory({ messages: [] })).toEqual({
      ok: false,
      error: 'messages must be a non-empty array',
    });
    expect(parseHistory({ messages: 'hi' })).toEqual({
      ok: false,
      error: 'messages must be a non-empty array',
    });
  });

  it('rejects bad roles and empty content with indexed messages', () => {
    expect(parseHistory({ messages: [{ role: 'system', content: 'x' }] })).toEqual({
      ok: false,
      error: "messages[0].role must be 'user' or 'assistant'",
    });
    expect(parseHistory({ messages: [{ role: 'user', content: '' }] })).toEqual({
      ok: false,
      error: 'messages[0].content must be a non-empty string',
    });
  });

  it('accepts a valid user/assistant history', () => {
    const parsed = parseHistory({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
    expect(parsed).toEqual({
      ok: true,
      history: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
  });
});
