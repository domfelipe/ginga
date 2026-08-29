import { ginga, type IntentListener } from './ginga-sdk';
import type { IntentTraceStep } from './types';

export interface Recording {
  narration: string;
  trace: IntentTraceStep[];
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
