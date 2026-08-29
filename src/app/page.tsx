import Link from 'next/link';

import { TaughtToolsBadge } from '@/components/home/TaughtToolsBadge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <TaughtToolsBadge />
      <h1 className="font-heading max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Padaria Aurora —{' '}
        <span className="bg-gradient-to-r from-amber-700 via-amber-600 to-yellow-600 bg-clip-text text-transparent dark:from-amber-400 dark:via-amber-300 dark:to-yellow-300">
          agent-ready
        </span>{' '}
        bakery
      </h1>
      <p className="max-w-md text-muted-foreground">
        Order like a human. Every step you take teaches Ginga how an AI agent could do it for you.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/menu" className={cn(buttonVariants({ size: 'lg' }))}>
          Browse the menu
        </Link>
        <Link
          href="/studio"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
        >
          Open the studio
        </Link>
      </div>
      <footer className="mt-10 text-xs text-muted-foreground">
        Built for the{' '}
        <a
          href="https://openai.com/"
          className="underline underline-offset-2 hover:text-foreground"
          target="_blank"
          rel="noreferrer"
        >
          OpenAI WebMCP Challenge
        </a>{' '}
        — Ginga · DomHubs
      </footer>
    </div>
  );
}
