import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST as compilePost } from '@/app/api/compile/route';

/**
 * Input caps for /api/compile (final review fix): the route is unauthenticated
 * on a public URL, so narration/trace/param sizes are bounded BEFORE any
 * OpenAI spend. Caps mirror the discipline used elsewhere — apprentice
 * (40 msgs × 2000 chars) and orders (500-char strings).
 */

const hadOpenAiKey = process.env.OPENAI_API_KEY;

function post(body: unknown): Promise<Response> {
  return compilePost(
    new Request('http://localhost/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function makeTrace(steps: number, skuChars = 10) {
  return Array.from({ length: steps }, (_, i) => ({
    intent: 'add_item',
    params: { sku: 'x'.repeat(skuChars) },
    at: i + 1,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (hadOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = hadOpenAiKey;
});

describe('compile input caps', () => {
  it('rejects narration over 2000 chars with 400 before any OpenAI call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ narration: 'a'.repeat(2001), trace: makeTrace(1) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/narration/);
    expect(json.error).toMatch(/2000/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects trace over 200 steps with 400 before any OpenAI call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ narration: 'ok', trace: makeTrace(201) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/trace/);
    expect(json.error).toMatch(/200/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a param value over 500 chars with 400 naming the step and key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({
      narration: 'ok',
      trace: [
        { intent: 'add_item', params: { sku: 'pao-queijo-duzia' }, at: 1 },
        { intent: 'set_note', params: { text: 'x'.repeat(501) }, at: 2 },
      ],
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/trace\[1\]\.params\.text/);
    expect(json.error).toMatch(/500/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a nested param whose JSON size exceeds 500 chars (no smuggling past the cap)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({
      narration: 'ok',
      trace: [
        {
          intent: 'confirm_order',
          params: { items: [{ sku: 'x'.repeat(300) }, { sku: 'y'.repeat(300) }] },
          at: 1,
        },
      ],
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/trace\[0\]\.params\.items/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts boundary values (2000-char narration, 200 steps, 500-char params)', async () => {
    // stop the route at the API-key gate, i.e. PAST every cap check: a 500
    // "not configured" proves no cap rejected a boundary-legal payload
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ narration: 'a'.repeat(2000), trace: makeTrace(200, 500) });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: 'OPENAI_API_KEY is not configured on the server',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
