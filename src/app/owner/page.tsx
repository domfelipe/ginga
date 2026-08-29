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
    const run = () => void refresh();
    // initial fetch deferred out of the effect body (react-hooks/set-state-in-effect)
    const timeout = setTimeout(run, 0);
    const id = setInterval(run, 5000);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
    };
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Kitchen view — orders in real time</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-green-500" />
          live · refreshes every 5s
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
