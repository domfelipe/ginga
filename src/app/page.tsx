import Link from 'next/link';

import { Bot, MousePointerClick, Wrench } from 'lucide-react';

import { RodaMark } from '@/components/design/RodaMark';
import { TaughtToolsBadge } from '@/components/home/TaughtToolsBadge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: MousePointerClick,
    title: 'Demonstrate',
    text: 'Order once, like a human — Ginga records every step you take.',
  },
  {
    icon: Wrench,
    title: 'Compile',
    text: 'The recording becomes a typed, validated WebMCP tool.',
  },
  {
    icon: Bot,
    title: 'Delegate',
    text: 'Any agent can now place the order — same path you used.',
  },
] as const;

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      {/* warm light behind the hero — decorative only */}
      <div aria-hidden className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      {/* the roda — Ginga's signature circle holding the whole scene, barely there */}
      <RodaMark
        aria-hidden
        dashed
        weight={0.4}
        className="pointer-events-none absolute left-1/2 top-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 text-primary opacity-[0.07] sm:size-[42rem]"
      />

      <div className="relative flex flex-col items-center gap-6">
        <TaughtToolsBadge />

        <h1 className="font-display max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Padaria Aurora —{' '}
          <span className="font-display italic text-terracotta">agent-ready</span> bakery
        </h1>

        <p className="max-w-md text-pretty text-muted-foreground">
          Order like a human. Every step you take teaches Ginga how an AI agent could do it for
          you.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/menu" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-6')}>
            Browse the menu
          </Link>
          <Link
            href="/studio"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-full px-6')}
          >
            Open the studio
          </Link>
        </div>

        {/* how it works — three steps, static content */}
        <ol className="mt-14 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card/70 p-4 shadow-soft backdrop-blur-sm transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <step.icon className="size-4" aria-hidden />
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="font-display text-base font-semibold tracking-tight">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>

        <footer className="mt-14 flex items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <RodaMark weight={11} center className="size-3.5 shrink-0 text-terracotta/70" />
          <span>
            Built for the{' '}
            <a
              href="https://openai.com/"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              OpenAI WebMCP Challenge
            </a>{' '}
            — Ginga · DomHubs
          </span>
        </footer>
      </div>
    </div>
  );
}
