'use client';

import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SITE_URL } from '@/lib/site';
import type { TaughtTool } from '@/lib/types';

/**
 * Export panel for one taught tool (Task 9): everything an external site or
 * agent needs to consume the tool outside this app —
 *   1. the one-line embed snippet (`sdk.js` + `data-store`),
 *   2. the tool itself as a downloadable MCP `tool.json`,
 *   3. the plain HTTP `GET /api/tools` curl line (CORS is open on GET).
 */
export function ExportDialog({ tool }: { tool: TaughtTool }) {
  const embedSnippet = `<script src="${SITE_URL}/sdk.js" data-store="aurora"></script>`;
  const curlLine = `curl -s ${SITE_URL}/api/tools`;
  const fileName = `${tool.name}.tool.json`;

  async function copyText(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error(`Could not copy the ${what} — select it and copy manually.`);
    }
  }

  function downloadToolJson() {
    // MCP tool format: the four fields an agent runtime needs to call it
    const payload = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      steps: tool.steps,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>Export</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Export <span className="font-mono">{tool.name}</span>
            {tool.published ? (
              <Badge variant="secondary">published</Badge>
            ) : (
              <Badge variant="outline">draft</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Use this tool from any website or agent — embed the SDK, download the JSON, or call the
            public API.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">1. Embed on your site</p>
            <p className="text-xs text-muted-foreground">
              Paste before `&lt;/body&gt;`. The SDK registers every published tool with the
              browser&apos;s WebMCP runtime — no build step.
            </p>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{embedSnippet}</code>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void copyText(embedSnippet, 'Embed snippet')}
              >
                Copy
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">2. Download the tool</p>
            <p className="text-xs text-muted-foreground">
              MCP tool format: name, description, inputSchema and the recorded steps.
            </p>
            <div>
              <Button variant="outline" size="xs" onClick={downloadToolJson}>
                Download {fileName}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">3. Fetch over HTTP</p>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{curlLine}</code>
              <Button variant="ghost" size="xs" onClick={() => void copyText(curlLine, 'curl line')}>
                Copy
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
