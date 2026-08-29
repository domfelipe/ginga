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
        <h1 className="font-display text-3xl font-semibold tracking-tight">Cart</h1>
        <Link
          href="/menu"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-full')}
        >
          Continue shopping
        </Link>
      </header>

      {cart.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-accent text-2xl">
            🥐
          </span>
          <p className="text-muted-foreground">
            Your cart is empty — add something tasty from the menu.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          {/* receipt-style summary with dotted leaders */}
          <ul className="flex flex-col gap-3">
            {cart.items.map((line) => (
              <li key={line.sku} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-base"
                >
                  {line.emoji}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatUSD(line.price_cents)} each
                  </p>
                </div>
                <span aria-hidden className="mx-1 flex-1 self-center border-b border-dotted border-border" />
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    className="rounded-full"
                    aria-label={`Decrease ${line.name} quantity`}
                    onClick={() => cart.setQty(line.sku, line.qty - 1)}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    className="rounded-full"
                    aria-label={`Increase ${line.name} quantity`}
                    onClick={() => cart.setQty(line.sku, line.qty + 1)}
                  >
                    +
                  </Button>
                  <span className="ml-1 w-14 text-right font-medium tabular-nums">
                    {formatUSD(line.price_cents * line.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-baseline gap-2 border-t border-border pt-4 text-sm font-semibold">
            <span>Total</span>
            <span aria-hidden className="flex-1 self-center border-b border-dotted border-border" />
            <span className="font-display text-xl tabular-nums">{formatUSD(cart.totalCents)}</span>
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
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
            <Button
              onClick={placeOrder}
              disabled={submitting}
              size="lg"
              className="rounded-full text-base"
            >
              {submitting ? 'Placing order…' : 'Place order'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
