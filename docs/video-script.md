# Ginga — Demo Video Script (target: 2:50, hard cap 3:00)

**Presenter:** Felipe Domingues · **Format:** screen capture 1440p, real ChatGPT desktop browser for the live WebMCP segment
**Golden rule:** every take under 25s. If a take needs a retry, cut it as its own clip — never re-record the whole flow.
**Before recording:** OPENAI_API_KEY set on Vercel + local; one real compile done; ChatGPT desktop test passed (see T10 checklist in the runbook).

---

## Act 1 — Hook (0:00–0:20)

**Screen:** ginga live URL, Padaria Aurora home, then ChatGPT desktop with the site open in its browser.

- **0:00–0:08 — VO:** "This is Aurora, a bakery in Brazil. And this is my AI agent, browsing it in ChatGPT. Watch what happens when I ask for something the site never taught anyone."
- **Action:** type into ChatGPT: *"Add a birthday order: 3 dozen pão de queijo, deliver Friday, write 'for Pedro's party — he loves the cheesy ones'"* → agent flounders or genericizes ("I can't fill custom notes").
- **Caption:** `The site works for humans. Not for agents.`
- **0:15–0:20 — VO:** "The fix isn't an API. The fix is teaching. Watch."

## Act 2 — Teach (0:20–1:10)

**Screen:** /studio, Teach tab.

- **0:20–0:28 — VO:** "Ginga turns a demonstration into a real WebMCP tool. No code. I show it once, saying what I'm doing."
- **Action:** click "🎙 Teach a new tool" → red REC banner appears → narrate WHILE doing: *"I'm taking a custom order. First, the pão de queijo…"* (add 3 dozen) → cart → delivery date (Friday) → note *"for Pedro's party"* → Place order.
- **Caption:** `🔴 REC — steps counted live` (the banner counter is the visual proof).
- **0:52–1:10 — VO:** "Done. Now I tell it what this was — and Ginga compiles the demonstration into a tool: a name, a description, and a typed schema. The values I used become the parameters."
- **Action:** Stop & compile → narration box (already typed: "Take a custom birthday order with delivery date and a note") → Compile tool → **CompilePreview on screen** (highlight `qty`, `deliveryDate`, `note` in the schema). Save & register → toast "1 tool live for agents".
- **Caption:** `demo → real WebMCP tool, compiled by AI, saved by a human.`

## Act 3 — Delegate (1:10–2:20)

**Screen:** split — ChatGPT desktop (site open) left, /owner right.

- **1:10–1:22 — VO:** "Same page. Same agent. Now the site speaks its language — because the tool lives in the page itself, registered at runtime."
- **Action:** reload the page in ChatGPT's browser → ask the SAME request as Act 1: *"Add a birthday order: 3 dozen pão de queijo, deliver Friday…"* → agent discovers `create_custom_order`, shows the call with args `{qty: 3, deliveryDate: …, note: "for Pedro's party"}` → executes.
- **Caption:** `discovered + called at runtime — the tool was born minutes ago.`
- **1:50–2:05 — VO:** "And in the kitchen, the owner sees exactly what happened: an order that says it came from the apprentice, through the tool the owner taught."
- **Action:** /owner polls in → order card lands with 🤖 badge `via learn'd tool: create_custom_order`.
- **2:05–2:20 — VO:** "Human taste, agent speed. The human stays the master — every step the agent takes goes through the exact flow the human demonstrated."

## Act 4 — Vision + close (2:20–2:50)

**Screen:** ExportDialog snippet → a plain HTML page (pre-built locally) with the snippet pasted, tools registering in its console.

- **2:20–2:35 — VO:** "This isn't locked to our demo store. One script tag, and any website exposes its flows to agents — with the user's own session, on the user's own page."
- **Caption:** `<script src="ginga.app/sdk.js" data-store="aurora">` → `2 tools live`.
- **2:35–2:50 — VO:** "In Brazil we say ginga is the move you learn by watching the master. Two hundred million small businesses will be agent-ready. The ones who teach first win. Ginga — teach AI by showing, not coding."
- **End card:** `Ginga · OpenAI WebMCP Challenge · github.com/domfelipe/ginga · built with Next.js, Neon, Vercel, OpenAI`

---

## Shot list / production notes

| # | Take | Duration | Screen | Risk |
|---|------|----------|--------|------|
| 1 | Hook fail | 20s | ChatGPT + Aurora | agent behavior varies — keep whatever flounder reads natural |
| 2 | Teach flow | 30s | /studio → store → checkout | do ONE smooth pass; banner counter is your B-roll safety |
| 3 | Compile + preview + save | 18s | CompilePreview | pre-type narration; only click through on camera |
| 4 | Agent discovers + calls | 40s | ChatGPT split | longest take; if the agent rambles, speed-ramp 1.5× in edit |
| 5 | Owner badge lands | 15s | /owner | order arrives on next poll (≤5s) — cut to it immediately |
| 6 | Embed vision | 15s | snippet → foreign page console | pre-build the target page; paste is the only action |
| 7 | End card | 5s | static | — |

- Captions: white, bottom-third, `Inter 600`, key words in amber (matches the site palette).
- Music: free lib,巴西 percussion-lite, −18LUFS under VO.
- **English captions + English VO**; keep spoken PT-BR warmth on proper nouns (Pão de Queijo, Ginga).
- Export: 1080p60 H.264 high, <200MB, upload **public** on YouTube (judges won't fight unlisted).
