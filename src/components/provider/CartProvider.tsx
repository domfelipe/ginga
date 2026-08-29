'use client';

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export interface CartItem {
  sku: string;
  name: string;
  price_cents: number;
  emoji: string;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  totalCents: number;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'ginga.cart.v1';
const MAX_QTY = 99;
const EMPTY: CartItem[] = [];

// --- external store backed by sessionStorage -------------------------------
// useSyncExternalStore gives SSR/hydration safety (server snapshot is empty,
// client re-checks after hydration) with no setState-in-effect.
let initialized = false;
let cachedItems: CartItem[] = EMPTY;
const listeners = new Set<() => void>();

function parseStorage(): CartItem[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: CartItem[] = [];
    for (const entry of parsed) {
      if (entry === null || typeof entry !== 'object') continue;
      const { sku, name, price_cents, emoji, qty } = entry as Record<string, unknown>;
      if (typeof sku !== 'string' || typeof name !== 'string') continue;
      if (typeof price_cents !== 'number' || typeof emoji !== 'string') continue;
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue;
      items.push({ sku, name, price_cents, emoji, qty: Math.min(qty, MAX_QTY) });
    }
    return items;
  } catch {
    return [];
  }
}

function getSnapshot(): CartItem[] {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    cachedItems = parseStorage();
  }
  return cachedItems;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: CartItem[]): void {
  initialized = true;
  cachedItems = next;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable/full: cart still works in memory
    }
  }
  listeners.forEach((listener) => listener());
}

const clampQty = (qty: number) => Math.min(Math.max(qty, 1), MAX_QTY);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<CartContextValue>(() => {
    const totalCents = items.reduce((acc, line) => acc + line.qty * line.price_cents, 0);
    const count = items.reduce((acc, line) => acc + line.qty, 0);

    const add = (item: Omit<CartItem, 'qty'>, qty = 1) => {
      const current = getSnapshot();
      const existing = current.find((line) => line.sku === item.sku);
      const next = existing
        ? current.map((line) =>
            line.sku === item.sku ? { ...line, qty: clampQty(line.qty + qty) } : line,
          )
        : [...current, { ...item, qty: clampQty(qty) }];
      commit(next);
    };

    const setQty = (sku: string, qty: number) => {
      if (qty < 1) {
        commit(getSnapshot().filter((line) => line.sku !== sku));
        return;
      }
      commit(
        getSnapshot().map((line) => (line.sku === sku ? { ...line, qty: clampQty(qty) } : line)),
      );
    };

    const remove = (sku: string) => {
      commit(getSnapshot().filter((line) => line.sku !== sku));
    };

    const clear = () => commit([]);

    return { items, add, setQty, remove, clear, totalCents, count };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within GingaProvider');
  return ctx;
}
