export type IntentName = 'view_item'|'add_item'|'set_delivery'|'set_note'|'confirm_order';

export interface IntentTraceStep { intent: IntentName; params: Record<string, unknown>; at: number }

export interface ToolStep { intent: IntentName; params: Record<string, string|number> } // valores podem conter "{{param}}"

export interface CompiledTool { name: string; description: string; inputSchema: object; steps: ToolStep[] }

export interface TaughtTool extends CompiledTool { id: string; store_id: string; published: boolean; created_at: string }

export interface OrderRow { id: string; items: {sku:string;name:string;qty:number;price_cents:number}[]; delivery_date: string|null; note: string|null; total_cents: number; channel: 'human'|'agent'; tool_name: string|null; created_at: string }
