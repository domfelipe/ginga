import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUSD } from '@/lib/money';
import type { OrderRow } from '@/lib/types';

function ChannelBadge({ order }: { order: OrderRow }) {
  if (order.channel === 'agent') {
    return (
      <Badge>
        🤖 via learn&apos;d tool: {order.tool_name ?? 'unknown'}
      </Badge>
    );
  }
  return <Badge variant="secondary">🧑 human</Badge>;
}

export function OrderCard({ order }: { order: OrderRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>
            Order <span className="font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}</span>
          </CardTitle>
          <ChannelBadge order={order} />
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString('en-US', { hour12: false })}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {order.items.map((item) => (
            <li key={item.sku} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {item.qty}× {item.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatUSD(item.qty * item.price_cents)}
              </span>
            </li>
          ))}
        </ul>
        {(order.delivery_date || order.note) && (
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {order.delivery_date && <p>Delivery: {order.delivery_date}</p>}
            {order.note && <p>Note: {order.note}</p>}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-muted-foreground">Total</span>
        <span className="font-medium tabular-nums">{formatUSD(order.total_cents)}</span>
      </CardFooter>
    </Card>
  );
}
