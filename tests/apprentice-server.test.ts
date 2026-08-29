import { afterEach, describe, expect, it, vi } from 'vitest';

// the no-key path must fail BEFORE any db access; swap the db module so any
// premature reach is loud
const dbMock = vi.fn(() => {
  throw new Error('db must not be touched without a key');
});
vi.mock('@/lib/db', () => ({ getDb: () => dbMock }));

import { handleApprenticeTurn, parseHistory } from '@/lib/apprentice-server';

const hadOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (hadOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = hadOpenAiKey;
});

describe('handleApprenticeTurn — security boundary', () => {
  it('throws the friendly missing-key error before any db access when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      handleApprenticeTurn([{ role: 'user', content: 'order a dozen pao de queijo' }]),
    ).rejects.toThrow('OPENAI_API_KEY is not configured on the server');
    expect(dbMock).not.toHaveBeenCalled();
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
