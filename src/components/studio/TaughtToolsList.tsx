'use client';

import { useEffect, useState } from 'react';

import { ExportDialog } from '@/components/studio/ExportDialog';
import { Badge } from '@/components/ui/badge';
import type { TaughtTool } from '@/lib/types';

/** Fired on window after every successful registerAllTools() refresh. */
export const TOOLS_UPDATED_EVENT = 'ginga:tools-updated';

/**
 * Studio view of every taught tool (owner scope: `?all=1` includes drafts).
 * Each row exposes the Task 9 ExportDialog (embed snippet + tool.json +
 * curl). Re-fetches whenever the WebMCP registry refreshes (TOOLS_UPDATED_EVENT
 * from GingaProvider) so the list mirrors what agents currently see.
 */
export function TaughtToolsList() {
  const [tools, setTools] = useState<TaughtTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/tools?all=1', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as { tools?: TaughtTool[] } | null;
        if (!res.ok) throw new Error(`failed to load tools (status ${res.status})`);
        if (cancelled) return;
        setTools(Array.isArray(data?.tools) ? data.tools : []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error');
      }
    }
    void load();
    window.addEventListener(TOOLS_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TOOLS_UPDATED_EVENT, load);
    };
  }, []);

  if (error !== null) {
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium">Could not load the taught tools.</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (tools === null) {
    return <p className="text-sm text-muted-foreground">Loading taught tools…</p>;
  }

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">No tools yet — teach your first one.</p>
        <p className="text-xs text-muted-foreground">
          Use the Teach tab: record an order flow, describe it, and Ginga compiles it into an
          agent-ready tool.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tools.map((tool) => (
        <li
          key={tool.id}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="truncate font-mono text-sm">{tool.name}</span>
              {tool.published ? (
                <Badge variant="secondary">published</Badge>
              ) : (
                <Badge variant="outline">draft</Badge>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">{tool.description}</span>
          </div>
          <ExportDialog tool={tool} />
        </li>
      ))}
    </ul>
  );
}
