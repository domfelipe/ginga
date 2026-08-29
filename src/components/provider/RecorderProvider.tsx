'use client';

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { createRecorder } from '@/lib/recorder';
import type { IntentTraceStep } from '@/lib/types';

export interface RecorderContextValue {
  isRecording: boolean;
  trace: IntentTraceStep[];
  narration: string;
  start: () => void;
  stop: () => void;
  setNarration: (text: string) => void;
}

const RecorderContext = createContext<RecorderContextValue | null>(null);

// --- module-level external store (same pattern as CartProvider) -------------
// The recorder is a lazy singleton outside React, so the captured trace and
// narration survive client-side navigation between /studio and the store
// pages. useSyncExternalStore keeps SSR/hydration safe: the server snapshot is
// always idle.
interface RecorderState {
  isRecording: boolean;
  trace: IntentTraceStep[];
  narration: string;
}

const SERVER_STATE: RecorderState = { isRecording: false, trace: [], narration: '' };
let state: RecorderState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<RecorderState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function getSnapshot(): RecorderState {
  return state;
}

function getServerSnapshot(): RecorderState {
  return SERVER_STATE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let recorder: ReturnType<typeof createRecorder> | null = null;
function ensureRecorder() {
  if (recorder === null) {
    recorder = createRecorder((trace) => setState({ trace }));
  }
  return recorder;
}

// stable action identities: consumers re-render only when the snapshot changes
const actions = {
  start() {
    ensureRecorder().start(); // fires onTraceChange([]) → trace cleared in store
    setState({ isRecording: true, narration: '' });
  },
  stop() {
    ensureRecorder().stop(); // keeps the trace for display
    setState({ isRecording: false });
  },
  setNarration(text: string) {
    ensureRecorder().setNarration(text);
    setState({ narration: text });
  },
};

export function RecorderProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value: RecorderContextValue = { ...snapshot, ...actions };

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

export function useRecorder(): RecorderContextValue {
  const ctx = useContext(RecorderContext);
  if (!ctx) throw new Error('useRecorder must be used within GingaProvider');
  return ctx;
}
