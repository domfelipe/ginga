'use client';

import { useEffect } from 'react';

import { registerAllTools } from '@/lib/webmcp';

/**
 * Registers taught tools with the WebMCP runtime on mount — this is what makes
 * Ginga agent-facing. Registration is dynamic: after a tool is saved in the
 * studio, refreshTools() (GingaProvider context) re-runs registerAllTools()
 * WITHOUT a reload, so new tools go live for agents immediately.
 */
export function WebMcpRegistrar() {
  useEffect(() => {
    registerAllTools().catch((err: unknown) => {
      console.warn('[ginga:webmcp] tool registration failed:', err);
    });
  }, []);

  return null;
}
