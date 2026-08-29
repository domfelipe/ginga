import { ginga, type IntentListener } from './ginga-sdk';
import type { IntentTraceStep } from './types';

export interface Recording {
  narration: string;
  trace: IntentTraceStep[];
}

// key-order-independent comparison so param objects compare by content
function stableParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  return JSON.stringify(keys.map((key) => [key, params[key]]));
}

/**
 * Pure (no React) recorder of intent steps. While recording, a single
 * ginga.onIntent listener accumulates steps in delivery order; stop()
 * unsubscribes. start() begins a fresh recording (trace and narration reset)
 * and fires onTraceChange([]) so the UI can clear immediately.
 */
export function createRecorder(onTraceChange?: (trace: IntentTraceStep[]) => void) {
  let recording = false;
  let narration = '';
  let trace: IntentTraceStep[] = [];
  let unsubscribe: (() => void) | null = null;

  const notify = () => onTraceChange?.(trace);
  const listener: IntentListener = (step) => {
    // defense-in-depth: React StrictMode double-invokes effects in dev, which
    // can emit the same view_item twice in a row; a consecutive duplicate view
    // adds no information to a trace. Only view_item is deduped — repeated
    // add_item/set_note/… steps are meaningful user actions.
    const prev = trace[trace.length - 1];
    if (
      step.intent === 'view_item' &&
      prev?.intent === 'view_item' &&
      stableParams(prev.params) === stableParams(step.params)
    ) {
      return;
    }
    trace = [...trace, step];
    notify();
  };

  return {
    start() {
      recording = true;
      narration = '';
      trace = [];
      unsubscribe = ginga.onIntent(listener);
      notify();
    },
    stop() {
      recording = false;
      unsubscribe?.();
      unsubscribe = null;
    },
    isRecording() {
      return recording;
    },
    setNarration(text: string) {
      narration = text;
    },
    getRecording(): Recording {
      return { narration, trace };
    },
  };
}
