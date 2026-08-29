'use client';

import type { ReactNode } from 'react';

import { TeachBanner } from '@/components/studio/TeachBanner';
import { CartProvider } from './CartProvider';
import { RecorderProvider } from './RecorderProvider';

/**
 * Client provider tree for the whole app. RecorderProvider sits above every
 * route so the teach-mode recording (and the global TeachBanner) survive
 * client-side navigation across the store pages.
 */
export function GingaProvider({ children }: { children: ReactNode }) {
  return (
    <RecorderProvider>
      <CartProvider>
        {children}
        <TeachBanner />
      </CartProvider>
    </RecorderProvider>
  );
}
