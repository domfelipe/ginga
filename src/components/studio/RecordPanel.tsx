'use client';

import Link from 'next/link';

import { useRecorder } from '@/components/provider/RecorderProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { IntentTraceStep } from '@/lib/types';

/** `add_item · sku=pao-queijo-duzia, qty=1` */
export function formatStep(step: IntentTraceStep): string {
  const params = Object.entries(step.params)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return params ? `${step.intent} · ${params}` : step.intent;
}

export function RecordPanel() {
  const { isRecording, trace, narration, start, stop, setNarration } = useRecorder();

  if (isRecording) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <p className="text-sm font-medium">🔴 Recording — walk through the order flow</p>
        <p className="text-sm text-muted-foreground">
          Use the store naturally: open the{' '}
          <Link href="/menu" className="underline underline-offset-2">
            menu
          </Link>
          , add items to the cart, set delivery date and note, and place the order. Every action is
          captured as an intent step.
        </p>
        <ol className="flex flex-col gap-1 font-mono text-xs">
          {trace.map((step, i) => (
            <li key={`${step.at}-${i}`}>
              <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>{' '}
              {formatStep(step)}
            </li>
          ))}
        </ol>
        <div>
          <Button variant="outline" size="sm" onClick={stop}>
            Stop recording
          </Button>
        </div>
      </div>
    );
  }

  if (trace.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Record yourself ordering like a human — Ginga turns the steps into a tool an AI agent can
          call.
        </p>
        <Button onClick={start}>🎙 Teach a new tool</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Captured steps ({trace.length})</h2>
        <Button variant="ghost" size="xs" onClick={start}>
          Record again
        </Button>
      </div>
      <ol className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 font-mono text-xs">
        {trace.map((step, i) => (
          <li key={`${step.at}-${i}`}>
            <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>{' '}
            {formatStep(step)}
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="narration" className="text-sm font-medium">
          Tell the agent what this does
        </label>
        <Textarea
          id="narration"
          placeholder="e.g. Order a dozen pao de queijo for delivery on a given date"
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          maxLength={500}
        />
      </div>

      <div>
        <Button disabled title="Available in the next build">
          Compile tool
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Compilation arrives in the next build — your recording is kept.
        </p>
      </div>
    </div>
  );
}
