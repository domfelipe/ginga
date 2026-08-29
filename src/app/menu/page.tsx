import Link from 'next/link';

import { MenuItemCard } from '@/components/store/MenuItemCard';
import { buttonVariants } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CatalogRow = {
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  emoji: string;
};

export default async function MenuPage() {
  // T3 carry-in: a DB failure must render a readable empty state, not Next's
  // framework error page — consistent with the API routes' 500 JSON shape.
  let items: CatalogRow[] = [];
  let loadError: string | null = null;
  try {
    const db = getDb();
    items = (await db`
      select ci.sku, ci.name, ci.description, ci.price_cents, ci.emoji
      from catalog_items ci
      join stores s on s.id = ci.store_id
      where s.slug = 'aurora' and ci.available
      order by ci.price_cents asc, ci.sku asc
    `) as CatalogRow[];
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'unknown error';
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-muted-foreground">
            Fresh from the oven — order as yourself, or let an agent do it.
          </p>
        </div>
        <Link
          href="/cart"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-full')}
        >
          Go to cart
        </Link>
      </header>
      {loadError !== null ? (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">The menu could not be loaded right now.</p>
          <p className="text-sm text-muted-foreground">
            The kitchen database is unreachable ({loadError}). Please try again in a moment.
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">Menu is empty for now — check back soon.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MenuItemCard
              key={item.sku}
              sku={item.sku}
              name={item.name}
              description={item.description}
              priceCents={item.price_cents}
              emoji={item.emoji}
            />
          ))}
        </div>
      )}
    </div>
  );
}

