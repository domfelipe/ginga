# Ginga — Architecture (extended)

> Companion to the README, written for the OpenAI WebMCP Challenge submission.
> Live deployment: https://ginga-theta.vercel.app (Vercel project `ginga`).

## What Ginga is

Ginga is an **agent-ready bakery storefront** that demonstrates a new way to build tool-using agents: tools are **taught by demonstration** and registered with the browser's WebMCP runtime **at runtime**, by people who never write code.

A shop owner records themselves placing an order. Ginga captures each click as a semantic intent step, compiles the trace plus a one-sentence narration into a typed MCP tool, and registers it with `document.modelContext` — instantly, dynamically, without a deploy. Any WebMCP-capable agent (and Ginga's built-in Apprentice on plain browsers) can then place real orders through the exact same path the human used.

## The pipeline

```
demonstrate          compile                register                delegate
┌───────────┐   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Recorder   │──▶│ LLM compiler   │──▶│ WebMCP registry  │──▶│ Agent / Apprentice│
│ (intents)  │   │ gpt-4o-mini    │   │ modelContext     │   │ execute → orders  │
└───────────┘   └────────────────┘   └──────────────────┘   └──────────────────┘
```

### 1. Demonstrate (`/studio`, Teach tab)

`src/lib/recorder.ts` instruments the storefront (menu, cart, checkout) and turns user actions into `IntentTraceStep`s — `{ intent, params, at }` over the closed vocabulary `view_item | add_item | set_delivery | set_note | confirm_order` (`src/lib/intents.ts`). Recording survives client-side navigation (`RecorderProvider` + a global banner), and strict-mode double-mounts are deduped so traces stay clean.

### 2. Compile (`POST /api/compile`)

The narration and the trace go to `gpt-4o-mini`, which must answer with a strict `CompiledTool`: `name` (snake_case verb_noun), `description` (10–500 chars), JSON-Schema `inputSchema` (type object), and `steps` that may reference `{{placeholders}}` bound to schema properties. The response is validated in `src/lib/placeholders.ts` (`validateTool`): every placeholder used must be declared, every param must resolve to string|number. The compiled tool is reviewed in an editable preview (`CompilePreview`) — defaults and required flags are adjustable — then persisted via `POST /api/tools` into Neon (`taught_tools`).

### 3. Register (dynamic WebMCP)

`src/lib/webmcp.ts` fetches published tools from `GET /api/tools` and calls `document.modelContext.registerTool(...)` for each — feature-detected, so nothing breaks on browsers without the runtime. Re-registration is dynamic: saving a tool in the studio fires `refreshTools()`, which re-runs the registration with **no page reload**. A `?debug=1` query flag enables verbose bridge logging.

### 4. Delegate (one execute path, three surfaces)

Every tool call — from a real agent, the in-app Apprentice chat, or an external site running `sdk.js` — funnels through the same semantics:

1. **Validate + substitute** — agent args are validated against `inputSchema` (ajv, coerced) and `{{placeholders}}` in the steps are resolved (`substituteArgs`).
2. **Fold** — `foldSteps` (`src/lib/tool-executor.ts`, pure) reduces resolved steps to an order draft: `add_item` accumulates qty per SKU, `set_delivery`/`set_note` overwrite, `view_item`/`confirm_order` are trace metadata. Unknown SKU or invalid qty → typed error.
3. **Price + persist** — `POST /api/orders` (`createOrder`, server-authoritative) validates, prices from the catalog, and inserts an order with `channel: 'agent'` and the originating `tool_name`.
4. **Answer** — the confirmation text contract (`formatOrderResultText`) quotes the order back: `Order #… created: 2x …, deliver …  Total $…`.

Surfaces:

| Surface | Where | Runtime |
| --- | --- | --- |
| Real WebMCP agent | browser `document.modelContext` | `webmcp.ts` registry |
| Apprentice fallback | `/studio` Apprentice tab → `/api/apprentice` | server-side bounded function-calling loop (≤ 2 tool rounds, hard-capped, `tool_choice: 'none'` finish) |
| External sites | `public/sdk.js` (no build step) | same fold semantics ported standalone, dormant without `modelContext` |

## Data model (Neon Postgres, `db/0001_init.sql`)

- `stores` — the storefront (slug `aurora`)
- `catalog_items` — SKU, name, description, price_cents, emoji, availability
- `taught_tools` — compiled tools per store (unique `(store_id, name)`), `input_schema`/`steps` as JSONB, `published` flag
- `orders` — priced items, delivery date, note, total, `channel` (`human` | `agent`), `tool_name`

Money is integer cents everywhere; the owner's kitchen view (`/owner`) polls orders every 5s and pauses while the tab is hidden.

## Key design decisions

- **Semantic capture over DOM replay.** The recorder stores what the user *meant* — `{intent: 'add_item', params: {sku, qty}}` over a closed five-verb vocabulary — not what they clicked. DOM-level replay (classic RPA: selector lists + scripted clicks) breaks on any redesign, leaks page structure into the tool, and can't cross sites; semantic steps are stable, human-editable in the studio, trivially LLM-compilable into `{{placeholder}}` parameters, and exportable to any surface (WebMCP, `tool.json`, plain HTTP) because nothing in them depends on the page that produced them. The cost is a fixed intent vocabulary per domain — a trade Ginga takes deliberately: breadth comes from teaching, not from a universal browser macro.
- **One execute path (DRY).** `foldSteps` lives in a pure, server-safe module shared verbatim by the client bridge, the server apprentice executor, and (as a documented port) `sdk.js`. An agent's answer is identical no matter which surface ran the tool.
- **Non-programmers author tools.** The LLM compiler plus strict validation makes demonstration the only required skill. Validation errors are typed and actionable (bad name pattern, undeclared placeholder, empty steps, …).
- **Graceful degradation everywhere.** No `modelContext` → in-app registry still powers the Apprentice. No OpenAI key → the Apprentice explains exactly what to set. DB down → menu renders a readable empty state, API routes return structured 500s.
- **Bounded by construction.** The apprentice loop hard-caps tool rounds even against a hostile runtime that keeps emitting `tool_calls`; order validation rejects oversized/unknown inputs before touching the database.
- **Export as a first-class feature.** Each taught tool ships with an embed snippet (`<script src="…/sdk.js" data-store="aurora">`), a downloadable MCP `tool.json`, and a plain `curl` — because tools that only work inside their own app aren't really tools.

## Security posture

- All SQL uses tagged-template parameters (no string interpolation).
- Order creation re-validates everything server-side; client values are never trusted.
- `GET /api/tools` is read-only, published tools only (unless the studio asks with `?all=1`), CORS-open by design for `sdk.js`.
- Secrets (DATABASE_URL, OPENAI_API_KEY) live in the environment only; `.env*` is gitignored.

## Repository map

```
src/app/            routes: / (store), /menu, /cart, /owner, /studio, /api/*
src/components/     studio panels, store UI, providers (recorder, cart, tools)
src/lib/            recorder, compiler validation (placeholders), tool-executor,
                    webmcp bridge, apprentice loop, orders core, db client
public/sdk.js       standalone external-site bridge
tests/              vitest unit suites (recorder, compiler, fold, apprentice, …)
db/0001_init.sql    Neon schema + seed
```
