'use client';

import { useEffect, useState } from 'react';

import { ExportDialog } from '@/components/studio/ExportDialog';
import { Badge } from '@/components/ui/badge';
import type { TaughtTool } from '@/lib/types';

type ToolSchema = {
  properties?: Record<string, { type?: string }>;
  required?: string[];
};

/* Spec-sheet chip: property name (mono) + type + amber dot when required. */
function SchemaChip({
  name,
  prop,
  required,
}: {
  name: string;
  prop?: { type?: string };
  required: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px]">
      {required && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
      {name}
      <span className="text-muted-foreground">{prop?.type ?? 'any'}</span>
    </span>
  );
}

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
      {tools.map((tool) => {
        const schema = (tool.inputSchema ?? {}) as ToolSchema;
        const required = new Set(schema.required ?? []);
        const props = Object.entries(schema.properties ?? {});
        return (
          <li
            key={tool.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3.5 shadow-soft transition-colors hover:border-primary/40"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-display truncate text-base font-semibold tracking-tight">
                  {tool.name}
                </span>
                {tool.published ? (
                  <Badge variant="secondary">published</Badge>
                ) : (
                  <Badge variant="outline">draft</Badge>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{tool.description}</span>
              {props.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {props.map(([name, prop]) => (
                    <SchemaChip
                      key={name}
                      name={name}
                      prop={prop}
                      required={required.has(name)}
                    />
                  ))}
                </span>
              )}
            </div>
            <ExportDialog tool={tool} />
          </li>
        );
      })}
    </ul>
  );
}
