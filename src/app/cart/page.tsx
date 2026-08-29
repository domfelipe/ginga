'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { useCart } from '@/components/provider/CartProvider';
import { ginga } from '@/lib/ginga-sdk';
import { formatUSD } from '@/lib/money';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function CartPage() {
  const cart = useCart();
  const [deliveryDate, setDeliveryDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function placeOrder() {
    if (cart.items.length === 0 || submitting) return;
    const lines = cart.items.map((line) => ({ sku: line.sku, qty: line.qty }));

    // teaching trace first, then the real order
    ginga.intent('set_delivery', { date: deliveryDate });
    ginga.intent('set_note', { text: note });
    ginga.intent('confirm_order', { items: lines });

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines,
          deliveryDate: deliveryDate || undefined,
          note: note || undefined,
          channel: 'human',
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Request failed with status ${res.status}`;
        throw new Error(message);
      }
      const orderId =
        typeof data === 'object' && data !== null && 'orderId' in data
          ? String((data as { orderId: unknown }).orderId)
          : '';
      toast.success('Order placed!', { description: `Confirmation: ${orderId}` });
      cart.clear();
      setDeliveryDate('');
      setNote('');
    } catch (err) {
      toast.error('Could not place order', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
        <Link href="/menu" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          Continue shopping
        </Link>
      </header>

      {cart.items.length === 0 ? (
        <p className="text-muted-foreground">Your cart is empty — add something tasty from the menu.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {cart.items.map((line) => (
              <li key={line.sku} className="flex items-center gap-3 p-3">
                <span aria-hidden className="text-lg">
                  {line.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatUSD(line.price_cents)} each · {formatUSD(line.price_cents * line.qty)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Decrease ${line.name} quantity`}
                    onClick={() => cart.setQty(line.sku, line.qty - 1)}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Increase ${line.name} quantity`}
                    onClick={() => cart.setQty(line.sku, line.qty + 1)}
                  >
                    +
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm font-medium">
            <span>Total</span>
            <span className="tabular-nums">{formatUSD(cart.totalCents)}</span>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="deliveryDate" className="text-sm font-medium">
                Delivery date
              </label>
              <Input
                id="deliveryDate"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm font-medium">
                Note for the bakery
              </label>
              <Textarea
                id="note"
                placeholder="e.g. extra warm, no sugar on top…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </div>
            <Button onClick={placeOrder} disabled={submitting}>
              {submitting ? 'Placing order…' : 'Place order'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
