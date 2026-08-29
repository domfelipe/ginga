'use client';

import { useEffect } from 'react';

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
  useEffect(() => {
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
