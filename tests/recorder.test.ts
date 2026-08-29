import { describe, it, expect, vi } from 'vitest';
import { ginga } from '@/lib/ginga-sdk';
import { createRecorder } from '@/lib/recorder';

describe('recorder', () => {
  it('starts idle and reflects isRecording state', () => {
    const rec = createRecorder();
    expect(rec.isRecording()).toBe(false);
    rec.start();
    expect(rec.isRecording()).toBe(true);
    rec.stop();
    expect(rec.isRecording()).toBe(false);
  });

  it('accumulates steps in emission order while recording', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('view_item', { sku: 'sonho' });
    ginga.intent('add_item', { sku: 'pao-queijo-duzia', qty: 1 });
    ginga.intent('confirm_order', { items: [{ sku: 'pao-queijo-duzia', qty: 1 }] });
    const { trace } = rec.getRecording();
    expect(trace.map((s) => s.intent)).toEqual(['view_item', 'add_item', 'confirm_order']);
    expect(trace[1]).toMatchObject({ intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 1 } });
    expect(trace.every((s) => typeof s.at === 'number')).toBe(true);
    rec.stop();
  });

  it('ignores intents emitted before start()', () => {
    const rec = createRecorder();
    ginga.intent('view_item', { sku: 'sonho' });
    rec.start();
    ginga.intent('add_item', { sku: 'bolo-rolo', qty: 2 });
    expect(rec.getRecording().trace.map((s) => s.intent)).toEqual(['add_item']);
    rec.stop();
  });

  it('stop() unsubscribes: later intents are not captured', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('add_item', { sku: 'sonho', qty: 1 });
    rec.stop();
    ginga.intent('add_item', { sku: 'sonho', qty: 2 });
    expect(rec.getRecording().trace).toHaveLength(1);
  });

  it('start() resets a previous recording (fresh trace and narration)', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('add_item', { sku: 'sonho', qty: 1 });
    rec.setNarration('old session');
    rec.stop();

    rec.start();
    expect(rec.getRecording().trace).toEqual([]);
    expect(rec.getRecording().narration).toBe('');
    ginga.intent('add_item', { sku: 'coxinha', qty: 3 });
    expect(rec.getRecording().trace.map((s) => s.intent)).toEqual(['add_item']);
    rec.stop();
  });

  it('setNarration + getRecording return the full recording', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('set_note', { text: 'extra warm' });
    rec.setNarration('Adds a note to the order');
    rec.stop();
    expect(rec.getRecording()).toEqual({
      narration: 'Adds a note to the order',
      trace: [{ intent: 'set_note', params: { text: 'extra warm' }, at: expect.any(Number) }],
    });
  });

  it('onTraceChange fires with the growing trace, then an empty one on start()', () => {
    const onTraceChange = vi.fn();
    const rec = createRecorder(onTraceChange);
    expect(onTraceChange).not.toHaveBeenCalled();

    rec.start();
    expect(onTraceChange).toHaveBeenLastCalledWith([]);

    ginga.intent('add_item', { sku: 'sonho', qty: 1 });
    expect(onTraceChange).toHaveBeenCalledTimes(2);
    expect(onTraceChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ intent: 'add_item' }),
    ]);
    rec.stop();
    expect(onTraceChange).toHaveBeenCalledTimes(2); // stop() does not change the trace
  });

  it('drops consecutive duplicate view_item steps (StrictMode defense)', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('view_item', { sku: 'sonho' });
    ginga.intent('view_item', { sku: 'sonho' }); // e.g. StrictMode double-effect
    ginga.intent('view_item', { sku: 'bolo-rolo' }); // different sku: kept
    ginga.intent('view_item', { sku: 'sonho' }); // non-consecutive: kept
    const skuOf = (s: { params: Record<string, unknown> }) => String(s.params.sku);
    expect(rec.getRecording().trace.filter((s) => s.intent === 'view_item').map(skuOf)).toEqual([
      'sonho',
      'bolo-rolo',
      'sonho',
    ]);
    rec.stop();
  });

  it('does not dedupe consecutive duplicates of non-view intents', () => {
    const rec = createRecorder();
    rec.start();
    ginga.intent('add_item', { sku: 'sonho', qty: 1 });
    ginga.intent('add_item', { sku: 'sonho', qty: 1 }); // user really added twice
    ginga.intent('set_note', { text: 'warm' });
    ginga.intent('set_note', { text: 'warm' });
    expect(rec.getRecording().trace.map((s) => s.intent)).toEqual([
      'add_item',
      'add_item',
      'set_note',
      'set_note',
    ]);
    rec.stop();
  });

  it('does not fire onTraceChange for a deduped duplicate', () => {
    const onTraceChange = vi.fn();
    const rec = createRecorder(onTraceChange);
    rec.start();
    expect(onTraceChange).toHaveBeenCalledTimes(1); // start → []
    ginga.intent('view_item', { sku: 'sonho' });
    expect(onTraceChange).toHaveBeenCalledTimes(2);
    ginga.intent('view_item', { sku: 'sonho' }); // deduped: no notify
    expect(onTraceChange).toHaveBeenCalledTimes(2);
    rec.stop();
  });
});
