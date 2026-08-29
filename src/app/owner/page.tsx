'use client';

import { useCallback, useEffect, useState } from 'react';

import { OrderCard } from '@/components/store/OrderCard';
import type { OrderRow } from '@/lib/types';

// GET /api/orders returns { orders: OrderRow[] } — latest 50, newest first.
export default function OwnerPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Request failed with status ${res.status}`;
        throw new Error(message);
      }
      const list =
        typeof data === 'object' && data !== null && 'orders' in data
          ? (data as { orders: unknown }).orders
          : [];
      if (!Array.isArray(list)) throw new Error('unexpected response shape');
      setOrders(list as OrderRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    // T4 carry-in: skip the refresh while the tab is hidden — no wasted fetches
    // (and no stale-data churn) when the kitchen display is in a background tab.
    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    };
    // catch up immediately when the tab becomes visible again
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    // initial fetch deferred out of the effect body (react-hooks/set-state-in-effect)
    const timeout = setTimeout(run, 0);
    const id = setInterval(run, 5000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Kitchen wall</h1>
          <p className="text-sm text-muted-foreground">
            Orders in real time — from humans and agents alike.
          </p>
        </div>
        {/* remounts (and pops) whenever the poll brings a different order count */}
        <span
          key={orders.length}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft"
        >
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="animate-badge-pop font-semibold tabular-nums text-foreground">
            {orders.length}
          </span>
          on the wall · refreshes every 5s
        </span>
      </header>

      {error && <p className="text-sm text-destructive">Could not load orders: {error}</p>}
      {!error && orders.length === 0 ? (
        <p className="text-muted-foreground">No orders yet — place one from the cart.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
