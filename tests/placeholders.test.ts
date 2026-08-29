import { describe, it, expect } from 'vitest';
import { validateTool, substituteArgs } from '@/lib/placeholders';

// NOTE: the brief's fixtures used description:'x' (1 char), which the binding
// validation rule (description 10..500) must reject — fixtures below use a
// valid description so rejections/acceptances are attributable to the behavior
// under test. Everything else is verbatim from the brief.
const schema = {
  type: 'object',
  properties: { qty: { type: 'number' }, deliveryDate: { type: 'string' } },
  required: ['qty'],
};

describe('validateTool', () => {
  it('rejects step placeholder missing from schema', () => {
    const tool = {
      name: 'x',
      description: 'add items to the cart',
      inputSchema: schema,
      steps: [{ intent: 'add_item', params: { qty: '{{nope}}' } }],
    };
    expect(validateTool(tool as never).ok).toBe(false);
  });

  it('accepts consistent tool', () => {
    const tool = {
      name: 'x',
      description: 'add items to the cart',
      inputSchema: schema,
      steps: [
        { intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: '{{qty}}' } },
        { intent: 'set_delivery', params: { date: '{{deliveryDate}}' } },
      ],
    };
    expect(validateTool(tool as never).ok).toBe(true);
  });

  it('rejects invalid name (uppercase / bad chars)', () => {
    const tool = {
      name: 'Bad-Name',
      description: 'add items to the cart',
      inputSchema: schema,
      steps: [{ intent: 'add_item', params: { qty: '{{qty}}' } }],
    };
    const result = validateTool(tool as never);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/name/i);
  });

  it('rejects description shorter than 10 chars or longer than 500', () => {
    const base = {
      name: 'add_items',
      inputSchema: schema,
      steps: [{ intent: 'add_item', params: { qty: '{{qty}}' } }],
    };
    expect(validateTool({ ...base, description: 'x' } as never).ok).toBe(false);
    expect(validateTool({ ...base, description: 'a'.repeat(501) } as never).ok).toBe(false);
    expect(validateTool({ ...base, description: 'a'.repeat(500) } as never).ok).toBe(true);
  });

  it('rejects inputSchema whose type is not object or without properties', () => {
    const base = { name: 'add_items', description: 'add items to the cart' };
    expect(
      validateTool({
        ...base,
        inputSchema: { type: 'string' },
        steps: [],
      } as never).ok,
    ).toBe(false);
    expect(
      validateTool({ ...base, inputSchema: { type: 'object' }, steps: [] } as never).ok,
    ).toBe(false);
  });

  it('rejects intent outside ALLOWED_INTENTS', () => {
    const tool = {
      name: 'nuke_store',
      description: 'add items to the cart',
      inputSchema: schema,
      steps: [{ intent: 'delete_store', params: {} }],
    };
    const result = validateTool(tool as never);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/intent/i);
  });

  it('rejects step param values that are not string|number', () => {
    const tool = {
      name: 'add_items',
      description: 'add items to the cart',
      inputSchema: schema,
      steps: [{ intent: 'add_item', params: { qty: { nested: 1 } } }],
    };
    const result = validateTool(tool as never);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/string|number/i);
  });
});

describe('substituteArgs', () => {
  it('replaces {{param}} and coerces by schema type', () => {
    const steps = [{ intent: 'add_item', params: { sku: 'x', qty: '{{qty}}' } }];
    const out = substituteArgs(steps as never, { qty: 3 });
    expect(out).toEqual([{ intent: 'add_item', params: { sku: 'x', qty: 3 } }]);
  });

  it('coerces string values to number when schema type is number', () => {
    const steps = [{ intent: 'add_item', params: { qty: '{{qty}}' } }];
    const out = substituteArgs(steps as never, { qty: '3' }, schema);
    expect(out).toEqual([{ intent: 'add_item', params: { qty: 3 } }]);
  });

  it('rejects missing required args via ajv when inputSchema is given', () => {
    const steps = [{ intent: 'add_item', params: { qty: '{{qty}}' } }];
    expect(() => substituteArgs(steps as never, {}, schema)).toThrow(/qty|required/i);
  });

  it('rejects undefined arg without schema default', () => {
    const steps = [{ intent: 'set_delivery', params: { date: '{{deliveryDate}}' } }];
    expect(() => substituteArgs(steps as never, { qty: 1 })).toThrow(/deliveryDate/);
  });

  it('falls back to schema default when arg is undefined', () => {
    const schemaWithDefault = {
      type: 'object',
      properties: {
        qty: { type: 'number', default: 2 },
        deliveryDate: { type: 'string' },
      },
      required: [],
    };
    const steps = [{ intent: 'add_item', params: { qty: '{{qty}}' } }];
    const out = substituteArgs(steps as never, {}, schemaWithDefault);
    expect(out).toEqual([{ intent: 'add_item', params: { qty: 2 } }]);
  });

  it('ignores unknown arg keys', () => {
    const steps = [{ intent: 'add_item', params: { qty: '{{qty}}' } }];
    const out = substituteArgs(steps as never, { qty: 1, notInSchema: 'ignored' });
    expect(out).toEqual([{ intent: 'add_item', params: { qty: 1 } }]);
  });

  it('keeps literal params untouched', () => {
    const steps = [{ intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 2 } }];
    const out = substituteArgs(steps as never, {});
    expect(out).toEqual([{ intent: 'add_item', params: { sku: 'pao-queijo-duzia', qty: 2 } }]);
  });

  it('rejects uncoercible number values with an actionable error', () => {
    const steps = [{ intent: 'add_item', params: { qty: '{{qty}}' } }];
    expect(() => substituteArgs(steps as never, { qty: 'dozen' }, schema)).toThrow(/qty/i);
  });
});
