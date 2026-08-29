import type { IntentName } from './types';

/**
 * One-line rendering of a step, shared by the record trace list and the
 * compiled steps summary. Structurally compatible with both IntentTraceStep
 * and ToolStep (which carry no `at`).
 */
export function formatStep(step: { intent: IntentName; params: Record<string, unknown> }): string {
  const params = Object.entries(step.params)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return params ? `${step.intent} · ${params}` : step.intent;
}
