'use client';

import { useRouter } from 'next/navigation';

import { useRecorder } from '@/components/provider/RecorderProvider';
import { Button } from '@/components/ui/button';

/**
 * Fixed red bar shown on EVERY page while teaching (rendered at layout level,
 * inside GingaProvider). "Stop & compile" ends the recording and returns to
 * /studio where the trace is displayed.
 */
export function TeachBanner() {
  const { isRecording, trace, stop } = useRecorder();
  const router = useRouter();

  if (!isRecording) return null;

  function handleStop() {
    stop();
    router.push('/studio');
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between gap-3 bg-destructive px-4 text-white shadow-md dark:bg-[color-mix(in_oklch,var(--destructive)_72%,black)]">
      <p className="flex items-center gap-2 text-sm font-medium">
        {/* recording light — CSS pulse, disabled under prefers-reduced-motion */}
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex size-2.5 animate-rec-pulse rounded-full bg-white" />
        </span>
        REC — demonstrating…
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
          {trace.length} {trace.length === 1 ? 'step' : 'steps'}
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full border-transparent bg-white/15 text-white hover:bg-white/25 hover:text-white dark:bg-white/15 dark:hover:bg-white/25"
        onClick={handleStop}
      >
        Stop &amp; compile
      </Button>
    </div>
  );
}
