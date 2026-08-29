# Security Notes — Ginga (Padaria Aurora demo)

Human confirmation for static scanner advisories on the apprentice flow, and the
standing security posture of this repo. Last audit: 2026-08-29 (task 8 security
gate; grep-audited, see "SQL" below).

## Secrets

- The only credential is `OPENAI_API_KEY`, read exclusively server-side
  (`src/lib/apprentice-server.ts`, `src/lib/compilation.ts` via the compile
  route) and sent only as the OpenAI `Authorization` header. It is never
  returned in a response, never logged, and never imported by client code
  (`src/lib/apprentice.ts` is pure/injectable; `src/lib/webmcp.ts` is
  client-safe with no env access). `DATABASE_URL` is read only by
  `src/lib/db.ts` (`getDb`), which throws if called from a browser context.
- Test fixtures use computed fake values (e.g. `TEST_API_KEY` in
  `tests/apprentice.test.ts`) — not credentials, never a real key shape.

## Untrusted inputs and the LLM tool-execution chain

User chat history and LLM output are treated as untrusted at every hop:

1. Request body → `parseHistory` (src/lib/apprentice-server.ts): roles
   allowlisted (`user`/`assistant`), strings capped (40 messages × 2000 chars).
2. LLM `tool_calls` arguments → `clampToolArgs`
   (src/lib/tool-executor-http.ts): deep clamp before any validation — strings
   ≤500 chars, arrays ≤50, object depth ≤3, `__proto__`/`constructor`/`prototype`
   keys dropped. LLM output is bounded before it reaches order creation.
3. `substituteArgs` (src/lib/placeholders.ts): ajv schema validation against
   the tool's `inputSchema` + placeholder resolution with type coercion.
4. `foldSteps` (src/lib/tool-executor.ts): intents allowlisted
   (`ALLOWED_INTENTS`); item skus must exist in the catalog; qty ≥ 1.
5. `createOrder` (src/lib/orders.ts): full server-side revalidation —
   channel allowlist, sku strings ≤500 chars, qty integers 1..99 (merged),
   ISO `YYYY-MM-DD` delivery date, optional fields ≤500 chars, every sku
   re-checked against the DB catalog before pricing/insert.

## SQL

Every query in the repo is a Neon **tagged template** (driver-bound
parameters); there is zero string-concatenated or interpolated-into-string SQL.
Grep-audited repo-wide on 2026-08-29: query sites exist only in
`src/lib/queries.ts`, `src/lib/orders.ts`, `src/app/api/orders/route.ts`,
`src/app/api/tools/route.ts`, `src/app/api/catalog/route.ts`,
`src/app/api/health/route.ts`; `neon(` appears only in `src/lib/db.ts`; no
`.query(` / `db(` string-call sites exist.

The LLM loop has **no in-process SQL reach at all — not even a read**. The
apprentice chain (`src/lib/apprentice.ts` + `src/lib/apprentice-server.ts`)
imports no db symbol anywhere: the tools list itself is consumed over HTTP from
the SAME public, CORS-open `/api/tools` endpoint external agents use
(`fetchPublishedTools` — one parser shared with the browser bridge), and tool
execution goes through the same validated HTTP seam (`createToolExecutor`,
baseUrl = request origin → GET /api/catalog, POST /api/orders channel 'agent').
Its only inputs are: env key → OpenAI fetch, tools → HTTP, executor → HTTP.
Scanner advisories claiming "sql-injection entry" on
`runApprenticeTurn`/`/api/apprentice` are therefore structurally impossible,
not just audited away: orders SQL (tagged-template bound params in
`src/lib/orders.ts`) is reachable only from the `/api/orders` route, and the
taught-tools SELECT only from the `/api/tools` route.

## LLM outputs are never trusted

- Compiled tools pass `validateTool` (structure, tool-name regex, description
  bounds, placeholder↔schema consistency, intent allowlist) before
  persistence/registration (`POST /api/tools`).
- Tool-call arguments are executed only through the clamped + validated chain
  above; execution failures are returned to the model as tool results, never
  propagated raw to users.

## Known deferrals (demo window)

- No authentication and no rate limiting on `/api/*` — acceptable for the
  time-boxed jury demo; the input caps above bound abuse surface.
- OpenAI spend: set a hard spend/usage limit on the OpenAI API key before any
  public demo (the apprentice loop is bounded at ≤3 chat completions per
  request, but the endpoint itself is unauthenticated).
- Per-store single-tenant assumptions (aurora slug) are intentional for the demo.
