import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

import { ALLOWED_INTENTS } from './intents';
import type { CompiledTool, ToolStep } from './types';

/**
 * Pure helpers around a CompiledTool's inputSchema and its {{placeholder}}
 * step params:
 *
 * - validateTool: structural/semantic check of a compiled tool (used after the
 *   LLM responds and before persisting/registering it).
 * - substituteArgs: validate a complete args object against the tool's
 *   inputSchema (ajv, coerced types) and replace {{k}} placeholders in step
 *   params with resolved, schema-typed values.
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Minimal shape of the JSON Schema the LLM is asked to produce. */
export interface InputSchema {
  type?: string;
  properties?: Record<string, { type?: string; default?: unknown; [key: string]: unknown }>;
  required?: string[];
  [key: string]: unknown;
}

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g;
const FULL_PLACEHOLDER_RE = /^\{\{([a-zA-Z0-9_]+)\}\}$/;

const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 500;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateTool(tool: CompiledTool): ValidationResult {
  if (!isPlainObject(tool)) {
    return { ok: false, error: 'tool must be an object' };
  }

  if (typeof tool.name !== 'string' || !TOOL_NAME_RE.test(tool.name)) {
    return {
      ok: false,
      error: `name "${String(tool.name)}" must match /^[a-z][a-z0-9_]{0,63}$/ (snake_case verb_noun)`,
    };
  }

  if (
    typeof tool.description !== 'string' ||
    tool.description.length < MIN_DESCRIPTION ||
    tool.description.length > MAX_DESCRIPTION
  ) {
    return {
      ok: false,
      error: `description must be a string of ${MIN_DESCRIPTION}..${MAX_DESCRIPTION} chars (got ${typeof tool.description}${
        typeof tool.description === 'string' ? ` with ${tool.description.length} chars` : ''
      })`,
    };
  }

  if (!isPlainObject(tool.inputSchema) || tool.inputSchema.type !== 'object') {
    return { ok: false, error: 'inputSchema must be an object with type "object"' };
  }
  const schema = tool.inputSchema as InputSchema;
  if (!isPlainObject(schema.properties)) {
    return { ok: false, error: 'inputSchema.properties must be an object' };
  }

  if (!Array.isArray(tool.steps)) {
    return { ok: false, error: 'steps must be an array' };
  }
  for (const [i, step] of tool.steps.entries()) {
    if (!isPlainObject(step) || typeof step.intent !== 'string') {
      return { ok: false, error: `steps[${i}] must be an object with an intent` };
    }
    if (!(ALLOWED_INTENTS as string[]).includes(step.intent)) {
      return {
        ok: false,
        error: `steps[${i}].intent "${step.intent}" is not allowed (allowed: ${ALLOWED_INTENTS.join(', ')})`,
      };
    }
    if (!isPlainObject(step.params)) {
      return { ok: false, error: `steps[${i}].params must be an object` };
    }
    for (const [key, value] of Object.entries(step.params)) {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return {
          ok: false,
          error: `steps[${i}].params.${key} must be string|number (got ${typeof value})`,
        };
      }
    }
  }

  // every {{placeholder}} used in steps must be declared in inputSchema.properties
  const serialized = JSON.stringify(tool.steps) ?? '';
  const used = new Set<string>(
    [...serialized.matchAll(PLACEHOLDER_RE)].map((match) => match[1]),
  );
  for (const name of used) {
    if (!(name in schema.properties)) {
      return {
        ok: false,
        error: `placeholder "{{${name}}}" used in steps has no matching inputSchema.properties entry`,
      };
    }
  }

  return { ok: true };
}

// --- args validation + substitution -----------------------------------------

// coerceTypes lets agent-supplied strings like "3" pass a type:number schema;
// explicit coercion below guarantees the ToolStep string|number contract.
// We validate a shallow copy so ajv's coercion never mutates the caller's args.
const ajv = new Ajv({ allErrors: true, coerceTypes: true });
const validatorCache = new Map<string, ValidateFunction>();

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath.length > 0 ? err.instancePath : '(root)';
  return `${path} ${err.message ?? 'is invalid'}`;
}

function getValidator(schema: InputSchema): ValidateFunction {
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

function resolveArg(
  name: string,
  args: Record<string, unknown>,
  properties: NonNullable<InputSchema['properties']>,
): string | number {
  let value = args[name];
  if (value === undefined) {
    const fallback = properties[name]?.default;
    if (fallback === undefined) {
      throw new Error(`missing value for argument "${name}" (no inputSchema default either)`);
    }
    value = fallback;
  }
  if (properties[name]?.type === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) {
      throw new Error(`cannot coerce argument "${name}" value "${String(value)}" to number`);
    }
    return n;
  }
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  throw new Error(
    `argument "${name}" must resolve to string|number for step params (got ${typeof value})`,
  );
}

export function substituteArgs(
  steps: ToolStep[],
  args: Record<string, unknown>,
  inputSchema?: InputSchema,
): ToolStep[] {
  const properties = inputSchema?.properties ?? {};

  if (inputSchema) {
    // validate the COMPLETE args object first: fail fast on missing required
    // keys (or badly typed ones, after ajv's own coercion) before substituting
    const validate = getValidator(inputSchema);
    if (!validate({ ...args })) {
      const detail = (validate.errors ?? []).map(formatAjvError).join('; ');
      throw new Error(`args do not match the tool input schema: ${detail}`);
    }
  }

  return steps.map((step) => {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(step.params)) {
      if (typeof value === 'string') {
        const full = value.match(FULL_PLACEHOLDER_RE);
        if (full) {
          params[key] = resolveArg(full[1], args, properties);
        } else {
          // placeholder inside a larger literal, e.g. "delivery on {{date}}"
          params[key] = value.replace(PLACEHOLDER_RE, (_match, name: string) =>
            String(resolveArg(name, args, properties)),
          );
        }
      } else {
        params[key] = value; // literal string|number, untouched
      }
    }
    return { ...step, params };
  });
}
