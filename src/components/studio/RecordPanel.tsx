'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { CompilePreview } from '@/components/studio/CompilePreview';
import { useRecorder } from '@/components/provider/RecorderProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatStep } from '@/lib/steps';
import type { CompiledTool } from '@/lib/types';

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

  if (compiled) {
    // re-compiling goes back to the captured trace (narration is kept);
    // key remounts the preview per compilation so its draft resets
    return <CompilePreview key={compileCount} tool={compiled} onRecompile={() => setCompiled(null)} />;
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
        <Button onClick={handleCompile} disabled={compiling}>
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
