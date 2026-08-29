'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { useGingaTools } from '@/components/provider/GingaProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { validateTool } from '@/lib/placeholders';
import { formatStep } from '@/lib/steps';
import type { CompiledTool } from '@/lib/types';

interface CompiledToolSchema {
  type?: string;
  properties?: Record<string, { type?: string; default?: unknown; [key: string]: unknown }>;
  required?: string[];
  [key: string]: unknown;
}

interface CompilePreviewProps {
  tool: CompiledTool;
  /** Back to the captured trace (e.g. to re-record or re-run the compiler). */
  onRecompile: () => void;
}

// guarantee editable defaults even if the model omits properties/required
function normalize(tool: CompiledTool): CompiledTool {
  const schema = (tool.inputSchema ?? {}) as CompiledToolSchema;
  return {
    ...tool,
    inputSchema: {
      ...schema,
      type: 'object',
      properties: schema.properties ?? {},
      required: schema.required ?? [],
    },
  };
}

// T6 carry-in: a number-typed property must hold a numeric default (steps math
// and ajv coercion both expect it). Non-numeric input is kept as a string so
// the user sees exactly what they typed, flagged by defaultIsInvalid below —
// saving is blocked until it is fixed or cleared.
function defaultIsInvalid(prop: { type?: string; default?: unknown }): boolean {
  return (
    prop.type === 'number' &&
    typeof prop.default === 'string' &&
    prop.default.trim() !== '' &&
    Number.isNaN(Number(prop.default))
  );
}

/**
 * Editable review of the compiled tool: name, description, schema properties
 * (required toggle + default) and a read-only summary of the steps.
 * "Save & register" persists the tool and triggers dynamic WebMCP
 * re-registration (no reload).
 *
 * State is initialized from props once; the parent must pass a changing `key`
 * (per compilation) so a fresh tool remounts this component with a fresh draft.
 */
export function CompilePreview({ tool, onRecompile }: CompilePreviewProps) {
  const [draft, setDraft] = useState<CompiledTool>(() => normalize(tool));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { refreshTools } = useGingaTools();

  const schema = draft.inputSchema as CompiledToolSchema;
  const validation = validateTool(draft);

  async function handleSave() {
    if (!validation.ok || hasInvalidDefault || saving || saved) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: draft }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409) {
        // R3: duplicate tool name for the store
        toast.error('Tool name already taken', {
          description: data?.error ?? 'Rename the tool and save again.',
        });
        return;
      }
      if (!res.ok) {
        toast.error(data?.error ?? `saving failed with status ${res.status}`);
        return;
      }
      setSaved(true);
      toast.success(`"${draft.name}" saved`);
      await refreshTools(); // re-register dynamically — no reload
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'network error while saving tool');
    } finally {
      setSaving(false);
    }
  }

  function setName(name: string) {
    setDraft((prev) => ({ ...prev, name }));
  }
  function setDescription(description: string) {
    setDraft((prev) => ({ ...prev, description }));
  }
  function toggleRequired(name: string) {
    setDraft((prev) => {
      const schema = prev.inputSchema as CompiledToolSchema;
      const required = new Set(schema.required ?? []);
      if (required.has(name)) {
        required.delete(name);
      } else {
        required.add(name);
      }
      return { ...prev, inputSchema: { ...schema, required: [...required] } };
    });
  }
  function setDefault(name: string, raw: string) {
    setDraft((prev) => {
      const schema = prev.inputSchema as CompiledToolSchema;
      const prop = schema.properties?.[name] ?? {};
      let value: string | number | undefined;
      if (prop.type === 'number') {
        // coerce numerics eagerly; a non-numeric string is kept for the hint
        // (and blocks save) instead of silently becoming NaN/0
        value = raw === '' ? undefined : Number.isNaN(Number(raw)) ? raw : Number(raw);
      } else {
        value = raw;
      }
      return {
        ...prev,
        inputSchema: { ...schema, properties: { ...schema.properties, [name]: { ...prop, default: value } } },
      };
    });
  }

  const hasInvalidDefault = Object.values(schema.properties ?? {}).some(defaultIsInvalid);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold tracking-tight">Compiled tool</h2>
        {validation.ok ? (
          <Badge variant="secondary">valid</Badge>
        ) : (
          <Badge variant="destructive">invalid</Badge>
        )}
      </div>
      {!validation.ok && <p className="text-xs text-destructive">{validation.error}</p>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="tool-name"
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-description" className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id="tool-description"
          value={draft.description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Parameters</p>
        {Object.entries(schema.properties ?? {}).map(([name, prop]) => (
          <div
            key={name}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
          >
            {(schema.required ?? []).includes(name) && (
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            )}
            <span className="font-mono text-xs">{name}</span>
            <Badge variant="outline">{prop.type ?? 'any'}</Badge>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--primary)]"
                checked={(schema.required ?? []).includes(name)}
                onChange={() => toggleRequired(name)}
              />
              required
            </label>
            <Input
              aria-label={`default for ${name}`}
              placeholder="default"
              value={prop.default === undefined ? '' : String(prop.default)}
              onChange={(e) => setDefault(name, e.target.value)}
              className="h-6 w-36 text-xs"
              aria-invalid={defaultIsInvalid(prop)}
            />
            {defaultIsInvalid(prop) && (
              <span className="w-full text-xs text-destructive">invalid number</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Steps ({draft.steps.length})</p>
        <ol className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 font-mono text-xs">
          {draft.steps.map((step, i) => (
            <li key={`${step.intent}-${i}`}>
              <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>{' '}
              {formatStep(step)}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRecompile}>
          Re-compile
        </Button>
        <Button
          onClick={handleSave}
          disabled={!validation.ok || hasInvalidDefault || saving || saved}
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save & register'}
        </Button>
        {hasInvalidDefault ? (
          <span className="text-xs text-destructive">Fix the invalid number default to save.</span>
        ) : (
          !saved && (
            <span className="text-xs text-muted-foreground">
              Saved tools go live for agents immediately.
            </span>
          )
        )}
      </div>
    </div>
  );
}
