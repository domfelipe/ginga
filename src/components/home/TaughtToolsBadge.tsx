'use client';

import { useEffect, useState } from 'react';

import type { TaughtTool } from '@/lib/types';

/**
 * Live count of published (agent-visible) tools. Server-rendered page stays a
 * server component; this island fetches /api/tools client-side after mount.
 */
export function TaughtToolsBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tools')
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<{ tools: TaughtTool[] }>;
      })
      .then((data) => {
        if (!cancelled) setCount(data.tools.length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {count === null ? (
        'Taught tools: …'
      ) : (
        <>
          {count} taught {count === 1 ? 'tool' : 'tools'} live for agents
        </>
      )}
    </span>
  );
}
