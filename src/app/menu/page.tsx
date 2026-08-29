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
  const db = getDb();
  const items = (await db`
    select ci.sku, ci.name, ci.description, ci.price_cents, ci.emoji
    from catalog_items ci
    join stores s on s.id = ci.store_id
    where s.slug = 'aurora' and ci.available
    order by ci.price_cents asc, ci.sku asc
  `) as CatalogRow[];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
        <Link href="/cart" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Go to cart
        </Link>
      </header>
      {items.length === 0 ? (
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
