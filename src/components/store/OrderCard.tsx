import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUSD } from '@/lib/money';
import type { OrderRow } from '@/lib/types';

/* Channel rendered as a rubber stamp: agent orders get the warm amber stamp,
   human orders a neutral one — readable as "kitchen wall" at a glance. */
function ChannelStamp({ order }: { order: OrderRow }) {
  if (order.channel === 'agent') {
    return (
      // stamp-hit: one-shot stamp-in on mount (new ticket arriving on the
      // wall); reduced motion lands it instantly at the same rest state
      <span className="animate-stamp-hit inline-flex -rotate-2 items-center gap-1 rounded-sm border-2 border-primary/70 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
        <span aria-hidden>🤖</span>
        agent · {order.tool_name ?? 'unknown'}
      </span>
    );
  }
  return (
    <span className="inline-flex rotate-1 items-center gap-1 rounded-sm border-2 border-muted-foreground/40 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      <span aria-hidden>🧑</span>
      human
    </span>
  );
}

export function OrderCard({ order }: { order: OrderRow }) {
  const hasStub = Boolean(order.delivery_date || order.note);

  return (
    <Card className="transition-shadow hover:shadow-lift">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-baseline gap-1">
            <span aria-hidden className="font-mono text-xs text-muted-foreground">
              #
            </span>
            <span className="font-mono tracking-wide">{order.id.slice(0, 8)}</span>
          </CardTitle>
          <ChannelStamp order={order} />
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString('en-US', { hour12: false })}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {order.items.map((item) => (
            <li key={item.sku} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">
                {item.qty}× {item.name}
              </span>
              <span aria-hidden className="min-w-4 flex-1 border-b border-dotted border-border" />
              <span className="tabular-nums text-muted-foreground">
                {formatUSD(item.qty * item.price_cents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{formatUSD(order.total_cents)}</span>
        </div>
      </CardContent>
      {/* tear-off line with punched notches — printed ticket edge */}
      <div aria-hidden className="relative -mx-px border-t-2 border-dashed border-border">
        <span className="absolute -left-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-background" />
        <span className="absolute -right-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-background" />
      </div>
      {hasStub && (
        <div className="flex flex-col gap-0.5 bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          {order.delivery_date && (
            <p>
              Delivery: <span className="text-foreground">{order.delivery_date}</span>
            </p>
          )}
          {order.note && <p className="truncate">Note: “{order.note}”</p>}
        </div>
      )}
    </Card>
  );
}
