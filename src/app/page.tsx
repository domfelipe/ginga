import Link from 'next/link';

import { TaughtToolsBadge } from '@/components/home/TaughtToolsBadge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <TaughtToolsBadge />
      <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Padaria Aurora — agent-ready bakery
      </h1>
      <p className="max-w-md text-muted-foreground">
        Order like a human. Every step you take teaches Ginga how an AI agent could do it for you.
      </p>
      <Link href="/menu" className={cn(buttonVariants({ size: 'lg' }))}>
        Browse the menu
      </Link>
    </div>
  );
}
