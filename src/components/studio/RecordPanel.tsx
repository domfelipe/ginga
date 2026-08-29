'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

import { CompilePreview } from '@/components/studio/CompilePreview';
import { useRecorder } from '@/components/provider/RecorderProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatStep } from '@/lib/steps';
import type { CompiledTool } from '@/lib/types';

/* Live-console line: numbered chip + intent, params in muted mono. Splits the
   shared formatStep output once (intent never contains ' · '). */
function TraceLine({ step, index }: { step: Parameters<typeof formatStep>[0]; index: number }) {
  const rendered = formatStep(step);
  const sep = rendered.indexOf(' · ');
  const intent = sep === -1 ? rendered : rendered.slice(0, sep);
  const params = sep === -1 ? null : rendered.slice(sep + 3);
  return (
    <li className="flex items-baseline gap-2">
      <span className="inline-flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-semibold text-primary">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="font-mono text-xs">
        {intent}
        {params && <span className="text-muted-foreground"> · {params}</span>}
      </span>
    </li>
  );
}

export function RecordPanel() {
  const { isRecording, trace, narration, start, stop, setNarration } = useRecorder();
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState<CompiledTool | null>(null);
  const [compileCount, setCompileCount] = useState(0);

  async function handleCompile() {
    setCompiling(true);
    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narration, trace }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data as { error?: string } | null)?.error ??
          `compilation failed with status ${res.status}`;
        toast.error(message);
        return;
      }
      const tool = (data as { tool?: CompiledTool } | null)?.tool;
      if (!tool) {
        toast.error('compiler returned no tool');
        return;
      }
      setCompiled(tool);
      setCompileCount((c) => c + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'network error during compilation');
    } finally {
      setCompiling(false);
    }
  }

  if (isRecording) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className="size-2 animate-rec-pulse rounded-full bg-destructive" />
          Recording — walk through the order flow
        </p>
        <p className="text-sm text-muted-foreground">
          Use the store naturally: open the{' '}
          <Link href="/menu" className="underline underline-offset-2">
            menu
          </Link>
          , add items to the cart, set delivery date and note, and place the order. Every action is
          captured as an intent step.
        </p>
        <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/50 p-3">
          {trace.map((step, i) => (
            <TraceLine key={`${step.at}-${i}`} step={step} index={i} />
          ))}
        </ol>
        <div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={stop}>
            Stop recording
          </Button>
        </div>
      </div>
    );
  }

  if (compiled) {
    // re-compiling goes back to the captured trace (narration is kept);
    // key remounts the preview per compilation so its draft resets
    return <CompilePreview key={compileCount} tool={compiled} onRecompile={() => setCompiled(null)} />;
  }

  if (trace.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-soft">
        <p className="text-pretty text-sm text-muted-foreground">
          Record yourself ordering like a human — Ginga turns the steps into a tool an AI agent can
          call.
        </p>
        <Button size="lg" className="rounded-full px-6" onClick={start}>
          <MousePointerClick data-icon="inline-start" />
          Teach a new tool
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Captured steps ({trace.length})
        </h2>
        <Button variant="ghost" size="xs" onClick={start}>
          Record again
        </Button>
      </div>
      <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/50 p-3">
        {trace.map((step, i) => (
          <TraceLine key={`${step.at}-${i}`} step={step} index={i} />
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
        <Button onClick={handleCompile} disabled={compiling} className="rounded-full px-5">
          {compiling ? 'Compiling…' : 'Compile tool'}
        </Button>
        {compiling && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Turning your trace into a tool with gpt-4o-mini…
          </p>
        )}
      </div>
    </div>
  );
}
