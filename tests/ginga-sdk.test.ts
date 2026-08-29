import { describe, it, expect, vi } from 'vitest';
import { ginga } from '@/lib/ginga-sdk';

describe('ginga intent sdk', () => {
  it('notifies listeners with normalized step', () => {
    const spy = vi.fn(); const off = ginga.onIntent(spy);
    ginga.intent('add_item', { sku: 'pao-queijo-duzia', qty: 2 });
    expect(spy).toHaveBeenCalledWith({ intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 2 }, at: expect.any(Number) });
    off(); ginga.intent('add_item', { sku: 'x', qty: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
