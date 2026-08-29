'use client';

import { ginga } from '@/lib/ginga-sdk';
import { useCart, type CartItem } from '@/components/provider/CartProvider';
import { Button } from '@/components/ui/button';

interface AddToCartButtonProps {
  item: Omit<CartItem, 'qty'>;
}

export function AddToCartButton({ item }: AddToCartButtonProps) {
  const cart = useCart();

  function handleAdd() {
    cart.add(item);
    ginga.intent('add_item', { sku: item.sku, qty: 1 });
  }

  return (
    <Button size="sm" onClick={handleAdd} aria-label={`Add ${item.name} to cart`}>
      Add
    </Button>
  );
}
