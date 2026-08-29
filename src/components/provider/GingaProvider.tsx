'use client';

import type { ReactNode } from 'react';

import { CartProvider } from './CartProvider';

/**
 * Client provider tree for the whole app. Task 5's intent recorder will be
 * added inside this tree alongside CartProvider.
 */
export function GingaProvider({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
