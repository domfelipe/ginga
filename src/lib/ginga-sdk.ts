import type { IntentName, IntentTraceStep } from './types';

export type IntentListener = (step: IntentTraceStep) => void;

const listeners = new Set<IntentListener>();

export const ginga = {
  // Synchronous and no-throw by contract: the recorder must never miss a step
  // because of an async boundary, and UI handlers must never break on emit.
  // Set iteration preserves registration order.
  intent(name: IntentName, params: Record<string, unknown> = {}) {
    const step = { intent: name, params, at: Date.now() };
    listeners.forEach((l) => {
      try {
        l(step);
      } catch (err) {
        // one faulty listener must not abort delivery to the rest
        console.error('ginga: intent listener failed', err);
      }
    });
  },
  onIntent(cb: IntentListener) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};
