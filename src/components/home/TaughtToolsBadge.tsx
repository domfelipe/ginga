'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
    <Badge variant="outline">
      {count === null ? 'Taught tools: …' : `Taught tools: ${count}`}
    </Badge>
  );
}
