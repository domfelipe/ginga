import type { IntentName } from './types';

/**
 * Single source of truth for the intents Ginga understands.
 * Task 5 (recorder) and Task 7 (tool compiler/validation) import this.
 */
export const ALLOWED_INTENTS: IntentName[] = [
  'view_item',
  'add_item',
  'set_delivery',
  'set_note',
  'confirm_order',
];
