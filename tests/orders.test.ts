import { beforeEach, describe, expect, it, vi } from 'vitest';

// createOrder resolves the db lazily via getDb(); swap the module so validation
// tests never touch the network and success tests observe the exact queries.
const dbMock = vi.fn();
vi.mock('@/lib/db', () => ({ getDb: () => dbMock }));

import { createOrder } from '@/lib/orders';

const catalogRows = [
  { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', price_cents: 1500 },
  { sku: 'sonho', name: 'Sonho (2-pack)', price_cents: 900 },
];

function stubDbSucceeds() {
  let call = 0;
  dbMock.mockImplementation((() => {
    // tagged template: first call = catalog select, second = insert
    call += 1;
    if (call === 1) return Promise.resolve(catalogRows);
    return Promise.resolve([{ id: 'ord-42' }]);
  }) as unknown as typeof dbMock);
}

beforeEach(() => {
  dbMock.mockReset();
});

describe('createOrder — validation (no db touched)', () => {
  const base = { channel: 'agent' as const };

  it('rejects a non-object body', async () => {
    const result = await createOrder(null);
    expect(result).toEqual({ ok: false, status: 400, error: 'body must be a JSON object' });
    expect(dbMock).not.toHaveBeenCalled();
  });

  it("rejects a channel that is not 'human' or 'agent'", async () => {
    const result = await createOrder({ ...base, channel: 'robot', items: [{ sku: 'sonho', qty: 1 }] });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "channel must be 'human' or 'agent'",
    });
    expect(dbMock).not.toHaveBeenCalled();
  });

  it('rejects empty or non-array items', async () => {
    expect(await createOrder({ ...base, items: [] })).toMatchObject({ status: 400 });
    expect(await createOrder({ ...base, items: 'sonho' })).toMatchObject({ status: 400 });
    expect(dbMock).not.toHaveBeenCalled();
  });

  it('rejects bad qty and unknown fields shape', async () => {
    expect(await createOrder({ ...base, items: [{ sku: 'sonho', qty: 0 }] })).toMatchObject({
      status: 400,
    });
    expect(await createOrder({ ...base, items: [{ sku: 'sonho', qty: 1.5 }] })).toMatchObject({
      status: 400,
    });
    expect(await createOrder({ ...base, items: [{ sku: '', qty: 1 }] })).toMatchObject({
      status: 400,
    });
  });

  it('rejects a non-ISO deliveryDate', async () => {
    const result = await createOrder({
      ...base,
      items: [{ sku: 'sonho', qty: 1 }],
      deliveryDate: 'friday',
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'deliveryDate must be a valid YYYY-MM-DD date',
    });
  });

  it('rejects an unknown sku against the catalog', async () => {
    stubDbSucceeds();
    const result = await createOrder({ ...base, items: [{ sku: 'feijoada', qty: 1 }] });
    expect(result).toEqual({ ok: false, status: 400, error: 'unknown sku(s): feijoada' });
  });
});

describe('createOrder — success path', () => {
  it('merges duplicate skus, prices from the catalog and inserts channel/toolName', async () => {
    stubDbSucceeds();
    const result = await createOrder({
      channel: 'agent',
      items: [
        { sku: 'sonho', qty: 1 },
        { sku: 'sonho', qty: 2 },
        { sku: 'pao-queijo-duzia', qty: 3 },
      ],
      deliveryDate: '2026-09-05',
      note: 'extra warm',
      toolName: 'order_sonho',
    });
    expect(result).toEqual({
      ok: true,
      orderId: 'ord-42',
      items: [
        { sku: 'sonho', name: 'Sonho (2-pack)', qty: 3, price_cents: 900 },
        { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 3, price_cents: 1500 },
      ],
      totalCents: 3 * 900 + 3 * 1500,
    });
  });

  it('normalizes empty strings for optional fields to null in the insert', async () => {
    stubDbSucceeds();
    await createOrder({
      channel: 'human',
      items: [{ sku: 'sonho', qty: 1 }],
      deliveryDate: '',
      note: '',
    });
    // second db call is the insert; neon tagged template => (strings, ...values)
    const insertCall = dbMock.mock.calls[1] as unknown as
      | [TemplateStringsArray, ...unknown[]]
      | undefined;
    expect(insertCall).toBeDefined();
    const values = (insertCall ?? []).slice(1);
    expect(values[0]).toBe(JSON.stringify([{ sku: 'sonho', name: 'Sonho (2-pack)', qty: 1, price_cents: 900 }]));
    expect(values[1]).toBeNull(); // delivery_date
    expect(values[2]).toBeNull(); // note
    expect(values[3]).toBe(900); // total_cents
    expect(values[4]).toBe('human');
    expect(values[5]).toBeNull(); // tool_name
  });

  it('maps db failures to a 500 result', async () => {
    dbMock.mockImplementation(
      (() => Promise.reject(new Error('db down'))) as unknown as typeof dbMock,
    );
    const result = await createOrder({ channel: 'agent', items: [{ sku: 'sonho', qty: 1 }] });
    expect(result).toEqual({ ok: false, status: 500, error: 'db down' });
  });
});
