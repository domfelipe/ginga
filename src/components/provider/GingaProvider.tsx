'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { TeachBanner } from '@/components/studio/TeachBanner';
import { WebMcpRegistrar } from '@/components/provider/WebMcpRegistrar';
import { registerAllTools } from '@/lib/webmcp';
import { CartProvider } from './CartProvider';
import { RecorderProvider } from './RecorderProvider';

export interface ToolsContextValue {
  /**
   * Re-fetch published tools and re-register them with the WebMCP runtime —
   * dynamic registration, no page reload.
   */
  refreshTools: () => Promise<void>;
}

const ToolsContext = createContext<ToolsContextValue | null>(null);

export function useGingaTools(): ToolsContextValue {
  const ctx = useContext(ToolsContext);
  if (!ctx) throw new Error('useGingaTools must be used within GingaProvider');
  return ctx;
}

/**
 * Client provider tree for the whole app. RecorderProvider sits above every
 * route so the teach-mode recording (and the global TeachBanner) survive
 * client-side navigation across the store pages. WebMcpRegistrar registers
 * taught tools once on mount; refreshTools() re-registers after a save.
 */
export function GingaProvider({ children }: { children: ReactNode }) {
  const refreshTools = useCallback(async () => {
    try {
      const { registered, real } = await registerAllTools();
      if (real) {
        toast.success(`${registered} tools live for agents`);
      } else {
        toast.message(`${registered} tools saved`, {
          description: 'No WebMCP runtime detected — agents can run them in apprentice mode.',
        });
      }
    } catch (err) {
      toast.error('Could not refresh tools', {
        description: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }, []);

  const value = useMemo<ToolsContextValue>(() => ({ refreshTools }), [refreshTools]);

  return (
    <ToolsContext.Provider value={value}>
      <RecorderProvider>
        <CartProvider>
          {children}
          <TeachBanner />
          <WebMcpRegistrar />
        </CartProvider>
      </RecorderProvider>
    </ToolsContext.Provider>
  );
}
