import { describe, it, expect } from 'vitest';

import { CompilerError, compileTool, SYSTEM_PROMPT } from '@/lib/compilation';
import type { CompiledTool, IntentTraceStep } from '@/lib/types';

// --- fixtures ---------------------------------------------------------------

const trace: IntentTraceStep[] = [
  { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 1 }, at: 1 },
  { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 1 }, at: 2 },
  { intent: 'set_delivery', params: { date: '2026-09-01' }, at: 3 },
  { intent: 'set_note', params: { text: 'extra warm' }, at: 4 },
  { intent: 'confirm_order', params: { items: [{ sku: 'pao-queijo-duzia', qty: 2 }] }, at: 5 },
];

const narration = 'Order a dozen pao de queijo for delivery on a given date';

const rawTool: CompiledTool = {
  name: 'create_custom_order',
  description: 'Orders a chosen quantity of pao de queijo for delivery on a given date.',
  inputSchema: {
    type: 'object',
    properties: {
      qty: { type: 'number', default: 12, examples: [12] },
      deliveryDate: { type: 'string', default: '2026-09-01', examples: ['2026-09-01'] },
      note: { type: 'string', default: 'extra warm', examples: ['extra warm'] },
    },
    required: ['qty', 'deliveryDate'],
  },
  steps: [
    { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: '{{qty}}' } },
    { intent: 'set_delivery', params: { date: '{{deliveryDate}}' } },
    { intent: 'set_note', params: { text: '{{note}}' } },
    { intent: 'confirm_order', params: {} },
  ],
};

function mockOpenaiResponse(rawToolJson: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: rawToolJson } }] }),
  } as unknown as Response;
}

// fetch stub that records [url, init] calls and always returns `response`
function fakeFetch(response: Response) {
  const calls: unknown[][] = [];
  const impl = async (url: unknown, init: unknown) => {
    calls.push([url, init]);
    return response;
  };
  return { fetch: impl as unknown as typeof fetch, calls };
}

// --- tests -------------------------------------------------------------------

describe('compileTool', () => {
  it('(a) returns the validated tool for a consistent LLM response', async () => {
    const fake = fakeFetch(mockOpenaiResponse(JSON.stringify(rawTool)));
    const tool = await compileTool({ narration, trace }, fake.fetch);

    expect(tool).toStrictEqual(rawTool);
  });

  it('builds the OpenAI request with SYSTEM_PROMPT, user JSON, gpt-4o-mini and json_object mode', async () => {
    const fake = fakeFetch(mockOpenaiResponse(JSON.stringify(rawTool)));
    await compileTool({ narration, trace }, fake.fetch);

    expect(fake.calls).toHaveLength(1);
    const [url, init] = fake.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('gpt-4o-mini');
    // DECISION (controller): json_schema strict mode does not support arbitrary
    // nested "JSON Schema inside JSON" (inputSchema), so we use json_object and
    // enforce structure with validateTool after parsing.
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe('user');
    expect(JSON.parse(body.messages[1].content)).toEqual({ narration, trace });
  });

  it('(b) throws CompilerError when the LLM hallucinates a placeholder absent from the schema', async () => {
    const hallucinated: CompiledTool = {
      ...rawTool,
      steps: [{ intent: 'add_item', params: { sku: 'x', qty: '{{nope}}' } }],
    };
    const fake = fakeFetch(mockOpenaiResponse(JSON.stringify(hallucinated)));

    await expect(compileTool({ narration, trace }, fake.fetch)).rejects.toThrow(CompilerError);
  });

  it('(c) rejects an empty trace before calling the LLM', async () => {
    const fake = fakeFetch(mockOpenaiResponse(JSON.stringify(rawTool)));

    await expect(compileTool({ narration, trace: [] }, fake.fetch)).rejects.toThrow(/trace/i);
    expect(fake.calls).toHaveLength(0);
  });

  it('throws CompilerError when the LLM content is not valid JSON', async () => {
    const fake = fakeFetch(mockOpenaiResponse('not json at all'));

    await expect(compileTool({ narration, trace }, fake.fetch)).rejects.toThrow(CompilerError);
  });

  it('throws CompilerError with the upstream status when OpenAI responds with an error', async () => {
    const fake = fakeFetch({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'upstream overloaded' } }),
    } as unknown as Response);

    await expect(compileTool({ narration, trace }, fake.fetch)).rejects.toThrow(CompilerError);
    await expect(compileTool({ narration, trace }, fake.fetch)).rejects.toThrow(/503/);
  });
});

describe('SYSTEM_PROMPT', () => {
  it('is the fixed brief prompt', () => {
    expect(SYSTEM_PROMPT).toBe(`You convert a human's demonstrated web flow into a single MCP tool definition.
Given a narration and an ordered trace of semantic UI intents, output JSON:
{"name": snake_case verb_noun, "description": one clear sentence for an AI agent,
 "inputSchema": {"type":"object","properties":{...},"required":[...]},
 "steps": [{"intent": one of ALLOWED, "params": {...}}]}
Rules: demonstrated variable values (quantities, dates, notes, item names) become
{{snake_case}} placeholders in steps params AND properties in inputSchema with the
demonstrated value as "default" and "examples". Constant values (fixed sku chosen in
the flow) stay literal. Use intents only from ALLOWED. Reuse the trace order.`);
  });
});
