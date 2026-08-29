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
    <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between gap-3 bg-red-600 px-4 text-white shadow-md">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden>🔴</span>
        REC — demonstrating…
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">
          {trace.length} {trace.length === 1 ? 'step' : 'steps'}
        </span>
      </p>
      <Button size="sm" variant="outline" onClick={handleStop}>
        Stop &amp; compile
      </Button>
    </div>
  );
}
