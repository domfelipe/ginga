import { describe, expect, it } from 'vitest';

import { formatOrderResultText } from '@/lib/tool-executor';

/**
 * formatOrderResultText is the shared order-confirmation text contract: the
 * client buildExecute (webmcp.ts) and the server apprentice executor both
 * quote orders to agents with this exact format.
 */
describe('formatOrderResultText', () => {
  it('formats items, delivery date and total', () => {
    expect(
      formatOrderResultText(
        'ord-1',
        [{ sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 3 }],
        '2026-09-05',
        4500,
      ),
    ).toBe('Order #ord-1 created: 3x Pao de Queijo (dozen), deliver 2026-09-05. Total $45.00.');
  });

  it('omits the delivery clause when there is no date', () => {
    expect(
      formatOrderResultText(
        'ord-2',
        [
          { sku: 'sonho', name: 'Sonho (2-pack)', qty: 1 },
          { sku: 'pao-queijo-duzia', name: 'Pao de Queijo (dozen)', qty: 2 },
        ],
        null,
        4500,
      ),
    ).toBe('Order #ord-2 created: 1x Sonho (2-pack), 2x Pao de Queijo (dozen). Total $45.00.');
  });
});
