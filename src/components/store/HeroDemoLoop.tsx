import { RodaMark } from '@/components/design/RodaMark';

/**
 * Hero demo loop — a silent, self-running miniature of the whole product,
 * driven entirely by CSS keyframes on a shared 10s timeline (see globals.css).
 * Pure theatre: hardcoded content, no state, no logic. Reads as a miniature
 * of the real surfaces (kitchen-ticket line, compiled-tool card, agent reply)
 * using the same token system. Hidden from AT — the headline tells the story.
 */
export function HeroDemoLoop() {
  return (
    <div className="hero-loop relative mx-auto w-full max-w-[22rem]" aria-hidden="true">
      {/* faint roda holding the scene — ties the loop to the signature mark */}
      <RodaMark
        dashed
        weight={0.8}
        className="pointer-events-none absolute -left-6 -top-6 size-[calc(100%+3rem)] text-terracotta opacity-20 sm:opacity-25"
      />

      <div className="hl-stage relative h-[22.5rem] sm:h-[22rem]">
        {/* REC pill — mirrors the real TeachBanner while the ticket records */}
        <div className="hl-anim hl-rec absolute -top-1 right-0 z-20 inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-semibold text-white shadow-soft dark:bg-[color-mix(in_oklch,var(--destructive)_72%,black)]">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex size-1.5 animate-rec-pulse rounded-full bg-white" />
          </span>
          REC · step
          <span className="relative inline-flex h-3.5 w-3 items-center justify-center">
            <span className="hl-anim hl-count-1 absolute inset-0 flex items-center justify-center tabular-nums">1</span>
            <span className="hl-anim hl-count-2 absolute inset-0 flex items-center justify-center tabular-nums">2</span>
            <span className="hl-anim hl-count-3 absolute inset-0 flex items-center justify-center tabular-nums">3</span>
          </span>
        </div>

        {/* phase 1 — the order ticket, recorded step by step */}
        <div className="hl-anim hl-ticket absolute inset-x-0 top-3 z-10 rounded-xl border border-border bg-card p-3.5 shadow-soft">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            order · padaria aurora
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            <li className="hl-anim hl-line-1 flex items-baseline justify-between gap-2">
              <span>
                <span className="font-semibold text-terracotta">2×</span> Pão de Queijo{' '}
                <span className="text-muted-foreground">(dozen)</span>
              </span>
            </li>
            <li className="hl-anim hl-line-2 flex items-baseline justify-between gap-2">
              <span>
                deliver <span className="font-medium text-terracotta">Friday</span>
              </span>
            </li>
            <li className="hl-anim hl-line-3 flex items-baseline justify-between gap-2">
              <span className="truncate">
                note: <span className="text-terracotta">“for Pedro’s party”</span>
              </span>
            </li>
          </ul>
        </div>

        {/* phases 2–3 — the compiled tool assembles, then goes live */}
        <div className="hl-anim hl-card absolute inset-x-0 top-[6.5rem] z-10 rounded-xl border border-border bg-card p-3.5 shadow-lift">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            tool · webmcp
          </p>
          <p className="hl-anim hl-name font-display mt-0.5 truncate text-[13px] font-semibold tracking-tight">
            create_birthday_order
          </p>
          <p className="hl-anim hl-desc mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Place a birthday order for delivery on a given date.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <div className="hl-anim hl-chip-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1">
              <span className="font-mono text-[10px]">qty</span>
              <span className="rounded-full border border-border px-1.5 text-[9px] text-muted-foreground">
                number
              </span>
              <span className="ml-auto font-mono text-[10px] text-terracotta">24</span>
            </div>
            <div className="hl-anim hl-chip-2 flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1">
              <span className="font-mono text-[10px]">deliveryDate</span>
              <span className="rounded-full border border-border px-1.5 text-[9px] text-muted-foreground">
                string
              </span>
              <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-terracotta">Friday</span>
            </div>
            <div className="hl-anim hl-chip-3 flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1">
              <span className="font-mono text-[10px]">note</span>
              <span className="rounded-full border border-border px-1.5 text-[9px] text-muted-foreground">
                string
              </span>
              <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-terracotta">
                “for Pedro’s party”
              </span>
            </div>
          </div>
          <p className="hl-anim hl-live mt-2 flex items-center gap-1.5 text-[10px] font-medium text-primary">
            <span className="size-1.5 animate-rec-pulse rounded-full bg-primary" />
            live for agents
          </p>
        </div>

        {/* phase 3 — an agent calls the tool */}
        <div className="hl-anim hl-bubble absolute inset-x-1 bottom-0 z-10 flex items-center gap-2 rounded-xl rounded-bl-sm border border-border bg-card px-3 py-2 shadow-soft">
          <span className="text-sm">🤖</span>
          <p className="text-[11px] leading-snug">
            Order placed — <span className="font-medium">2 dozen for Friday</span> ✓
          </p>
        </div>
      </div>
    </div>
  );
}
