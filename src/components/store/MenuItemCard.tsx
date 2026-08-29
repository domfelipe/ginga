'use client';

import { useEffect, useRef } from 'react';

import { ginga } from '@/lib/ginga-sdk';
import { formatUSD } from '@/lib/money';
import { AddToCartButton } from '@/components/store/AddToCartButton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export interface MenuItemCardProps {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  emoji: string;
}

export function MenuItemCard({ sku, name, description, priceCents, emoji }: MenuItemCardProps) {
  // StrictMode runs effects twice on mount in dev; the per-instance ref makes
  // the emission idempotent per mount while still re-emitting on a genuine
  // revisit (fresh instance after unmount) or sku change.
  const emittedSku = useRef<string | null>(null);

  useEffect(() => {
    if (emittedSku.current === sku) return;
    emittedSku.current = sku;
    ginga.intent('view_item', { sku });
  }, [sku]);

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-primary/40">
      <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-3">
        {/* bakery shelf tag: product emoji in a warm circular chip */}
        <span
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full bg-accent text-xl"
        >
          {emoji}
        </span>
        <CardTitle className="font-semibold tracking-tight">{name}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold tabular-nums text-secondary-foreground">
          {formatUSD(priceCents)}
        </span>
        <AddToCartButton item={{ sku, name, price_cents: priceCents, emoji }} />
      </CardFooter>
    </Card>
  );
}
