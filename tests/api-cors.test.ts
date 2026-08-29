import { afterEach, describe, expect, it } from 'vitest';

import { GET as catalogGet } from '@/app/api/catalog/route';
import { GET as ordersGet, OPTIONS as ordersOptions, POST as ordersPost } from '@/app/api/orders/route';

/**
 * CORS contract for the external sdk.js execute path (Task 9 fix round):
 * public/sdk.js runs on foreign sites, so /api/catalog must be directly
 * fetchable and /api/orders must answer the preflight (Content-Type: json is
 * non-simple) and carry ACAO on every JSON response. R6: public demo, no PII.
 */

const hadDbUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (hadDbUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = hadDbUrl;
});

function ensureNoDb() {
  delete process.env.DATABASE_URL; // force the deterministic db-less error path
}

describe('orders CORS contract', () => {
  it('answers preflight OPTIONS with 204 and the full CORS headers', () => {
    const res = ordersOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, GET, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });

  it('carries ACAO on the GET JSON response (db-less 500 path)', async () => {
    ensureNoDb();
    const res = await ordersGet();
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('carries ACAO on the POST JSON response (validation 400, no db touched)', async () => {
    const res = await ordersPost(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'nope' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, GET, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });
});

describe('catalog CORS contract', () => {
  it('carries ACAO on the GET JSON response (db-less 500 path)', async () => {
    ensureNoDb();
    const res = await catalogGet();
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
