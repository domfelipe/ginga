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
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-hidden className="mr-1.5 text-lg">
            {emoji}
          </span>
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">{description}</CardContent>
      <CardFooter className="justify-between">
        <span className="font-medium">{formatUSD(priceCents)}</span>
        <AddToCartButton item={{ sku, name, price_cents: priceCents, emoji }} />
      </CardFooter>
    </Card>
  );
}
