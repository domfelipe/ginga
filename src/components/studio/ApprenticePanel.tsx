'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ToolCallTrace } from '@/lib/apprentice';
import type { TaughtTool } from '@/lib/types';

/**
 * Modo Aprendiz — the judge-facing fallback panel. Anyone on a plain browser
 * (no document.modelContext) can chat with the apprentice and SEE it discover
 * the taught tools (badges) and invoke them (name + args + result trace per
 * turn). Client-side state only: a plain useState array, no persistence.
 */

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type ChatItem =
  | { kind: 'message'; role: 'user' | 'assistant'; content: string }
  | { kind: 'trace'; toolCalls: ToolCallTrace[] };

const NO_KEY_HINT = /OPENAI_API_KEY/i;

export function ApprenticePanel() {
  const [tools, setTools] = useState<TaughtTool[] | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tools')
      .then((res) => (res.ok ? res.json() : { tools: [] }))
      .then((data: { tools?: TaughtTool[] }) => {
        if (!cancelled) setTools(Array.isArray(data.tools) ? data.tools : []);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items, sending]);

  async function handleSend() {
    const text = input.trim();
    if (text.length === 0 || sending) return;
    // the server is stateless: the whole conversation travels in every request
    const history: ChatMessage[] = items
      .filter((item): item is Extract<ChatItem, { kind: 'message' }> => item.kind === 'message')
      .map((item) => ({ role: item.role, content: item.content }));
    history.push({ role: 'user', content: text });

    setItems((prev) => [...prev, { kind: 'message', role: 'user', content: text }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/apprentice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json().catch(() => null)) as {
        reply?: unknown;
        toolCalls?: unknown;
        error?: unknown;
      } | null;

      if (!res.ok) {
        const serverError = typeof data?.error === 'string' ? data.error : `status ${res.status}`;
        setItems((prev) => [
          ...prev,
          {
            kind: 'message',
            role: 'assistant',
            content: NO_KEY_HINT.test(serverError)
              ? 'The apprentice needs an OpenAI key to think. Owner: set OPENAI_API_KEY in the server environment (.env.local) and reload — the taught tools below are already wired and ready.'
              : `The apprentice could not answer (${serverError}).`,
          },
        ]);
        return;
      }
      const reply = typeof data?.reply === 'string' ? data.reply : '';
      const toolCalls = Array.isArray(data?.toolCalls) ? (data.toolCalls as ToolCallTrace[]) : [];
      setItems((prev) => {
        const next = [...prev];
        if (toolCalls.length > 0) next.push({ kind: 'trace', toolCalls });
        next.push({ kind: 'message', role: 'assistant', content: reply });
        return next;
      });
    } catch (err) {
      setItems((prev) => [
        ...prev,
        {
          kind: 'message',
          role: 'assistant',
          content: `Network error reaching the apprentice: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">
          What the apprentice knows
        </h2>
        {tools === null ? (
          <p className="text-xs text-muted-foreground">Loading taught tools…</p>
        ) : tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tools taught yet — record one in the Teach tab and it appears here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <Badge
                key={tool.id}
                variant="secondary"
                className="h-auto gap-1 px-2.5 py-1"
                title={tool.description}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {tool.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          Chat with the apprentice — e.g. “order a dozen pão de queijo for Friday”. Every tool it
          discovers and calls shows up as a trace, using the exact same execute path as a real
          WebMCP agent.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) =>
            item.kind === 'trace' ? (
              <li
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3"
              >
                {item.toolCalls.map((call, j) => (
                  <div key={j} className="flex flex-col gap-1 rounded-lg bg-card px-3 py-2 font-mono text-xs shadow-soft">
                    <span className="flex flex-wrap items-baseline gap-1.5">
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        tool
                      </span>
                      <span className="font-semibold">{call.name}</span>
                      <span className="break-all text-muted-foreground">
                        {JSON.stringify(call.args)}
                      </span>
                    </span>
                    <span className={call.resultText ? 'break-all' : 'break-all text-muted-foreground'}>
                      <span aria-hidden className="text-primary">
                        →{' '}
                      </span>
                      {call.resultText}
                    </span>
                  </div>
                ))}
              </li>
            ) : (
              <li
                key={i}
                className={
                  item.role === 'user'
                    ? 'max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-sm text-primary-foreground'
                    : 'max-w-[85%] self-start rounded-2xl rounded-bl-md border border-border bg-muted px-3 py-1.5 text-sm whitespace-pre-wrap'
                }
              >
                {item.content}
              </li>
            ),
          )}
        </ol>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the apprentice to place an order…"
          maxLength={2000}
          disabled={sending}
          aria-label="Message the apprentice"
          className="h-9 rounded-full px-4"
        />
        <Button
          type="submit"
          size="lg"
          className="rounded-full"
          disabled={sending || input.trim().length === 0}
        >
          {sending ? 'Thinking…' : 'Send'}
        </Button>
      </form>
      <div ref={bottomRef} />
    </div>
  );
}
