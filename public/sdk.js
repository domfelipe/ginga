/*!
 * Ginga SDK — agent-ready tools for ANY website (OpenAI WebMCP Challenge).
 *
 * Drop this on any page and every tool taught in the Ginga studio becomes a
 * live WebMCP tool in the visitor's browser:
 *
 *   <script src="https://ginga-theta.vercel.app/sdk.js" data-store="aurora"></script>
 *
 * Plain JS, no build step, no framework. Defensive by design: on pages without
 * a WebMCP runtime (document.modelContext) it stays dormant — one console.info,
 * zero errors. Errors from the tools API or the orders API are reported back to
 * the calling agent as MCP error results, never thrown into the host page.
 *
 * NOTE ON FIDELITY: foldSteps/substitution/result-formatting below are a
 * faithful standalone port of the canonical implementations in the Ginga app:
 *   - foldSteps          → src/lib/tool-executor.ts  (canonical)
 *   - arg substitution   → src/lib/placeholders.ts    (canonical, ajv-validated)
 *   - result text        → formatOrderResultText in src/lib/tool-executor.ts
 * Keep them in sync when the semantics change.
 */
(function () {
  'use strict';

  var SCRIPT_TAG = document.currentScript;
  if (!SCRIPT_TAG || !SCRIPT_TAG.src) {
    console.info('[ginga] sdk.js loaded without a src attribute — nothing to do.');
    return;
  }

  var GINGA_ORIGIN;
  try {
    GINGA_ORIGIN = new URL(SCRIPT_TAG.src).origin;
  } catch {
    console.info('[ginga] could not parse the sdk.js URL — nothing to do.');
    return;
  }

  var STORE_SLUG = (SCRIPT_TAG.getAttribute('data-store') || 'aurora').trim() || 'aurora';

  // --- port of src/lib/tool-executor.ts :: foldSteps (canonical) ---------------

  function foldSteps(steps, catalog) {
    var catalogBySku = {};
    for (var i = 0; i < catalog.length; i++) catalogBySku[catalog[i].sku] = catalog[i];

    var items = [];
    var indexBySku = {};
    var deliveryDate = null;
    var note = null;

    for (var j = 0; j < steps.length; j++) {
      var step = steps[j];
      if (step.intent === 'add_item') {
        var sku = String((step.params && step.params.sku) || '');
        var entry = catalogBySku[sku];
        if (!entry) throw new Error('unknown sku: ' + sku);
        var qty = Number(step.params && step.params.qty);
        if (!isFinite(qty) || qty < 1) throw new Error('invalid qty for sku: ' + sku);
        if (indexBySku[sku] === undefined) {
          indexBySku[sku] = items.length;
          items.push({ sku: sku, name: entry.name, qty: qty });
        } else {
          items[indexBySku[sku]].qty += qty;
        }
      } else if (step.intent === 'set_delivery') {
        if (step.params && step.params.date !== undefined) {
          deliveryDate = String(step.params.date);
        }
      } else if (step.intent === 'set_note') {
        if (step.params && step.params.text !== undefined) {
          note = String(step.params.text);
        }
      }
      // view_item / confirm_order are trace metadata, not order content
    }

    return { items: items, deliveryDate: deliveryDate, note: note };
  }

  // --- compact port of src/lib/placeholders.ts :: substituteArgs ---------------
  // Resolves {{placeholder}} params from the agent's args (or the schema
  // default) and coerces number-typed values. The canonical version additionally
  // validates the full args object with ajv; here the orders API is the
  // validation authority (it re-validates everything server-side).

  function substituteArgs(steps, args, schema) {
    var properties = (schema && schema.properties) || {};
    return steps.map(function (step) {
      var params = {};
      var raw = step.params || {};
      Object.keys(raw).forEach(function (key) {
        var value = raw[key];
        if (typeof value === 'string') {
          var full = value.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
          if (full) {
            params[key] = resolveArg(full[1], args, properties);
          } else {
            params[key] = value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, function (_m, name) {
              return String(resolveArg(name, args, properties));
            });
          }
        } else {
          params[key] = value; // literal string|number, untouched
        }
      });
      return { intent: step.intent, params: params };
    });
  }

  function resolveArg(name, args, properties) {
    var value = args ? args[name] : undefined;
    if (value === undefined) {
      var prop = properties[name] || {};
      if (prop.default === undefined) {
        throw new Error('missing value for argument "' + name + '"');
      }
      value = prop.default;
    }
    if (properties[name] && properties[name].type === 'number') {
      var n = Number(value);
      if (isNaN(n)) {
        throw new Error('cannot coerce argument "' + name + '" value "' + String(value) + '" to number');
      }
      return n;
    }
    return String(value);
  }

  // --- port of src/lib/tool-executor.ts :: formatOrderResultText (canonical) ---

  function formatUSD(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function formatOrderResultText(orderId, items, deliveryDate, totalCents) {
    var lines = items
      .map(function (item) { return item.qty + 'x ' + item.name; })
      .join(', ');
    var deliver = deliveryDate ? ', deliver ' + deliveryDate : '';
    return 'Order #' + orderId + ' created: ' + lines + deliver + '. Total ' + formatUSD(totalCents) + '.';
  }

  // --- execute: same pipeline as the in-app bridge (webmcp.ts buildExecute) ----

  function errorResult(text) {
    return { content: [{ type: 'text', text: text }], isError: true };
  }

  function makeExecute(tool) {
    return function (args) {
      // never reject: every failure path becomes an MCP error result
      return Promise.resolve()
        .then(function () {
          var steps = substituteArgs(tool.steps, args, tool.inputSchema);

          return fetch(GINGA_ORIGIN + '/api/catalog').then(function (res) {
            if (!res.ok) throw new Error('failed to load catalog (status ' + res.status + ')');
            return res.json();
          }).then(function (data) {
            if (!data || !Array.isArray(data.items)) {
              throw new Error('catalog response is malformed');
            }
            return foldSteps(steps, data.items);
          });
        })
        .then(function (folded) {
          return fetch(GINGA_ORIGIN + '/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: folded.items.map(function (item) { return { sku: item.sku, qty: item.qty }; }),
              deliveryDate: folded.deliveryDate || undefined,
              note: folded.note || undefined,
              channel: 'agent',
              toolName: tool.name,
            }),
          }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
              if (!res.ok) {
                return errorResult(
                  data && typeof data.error === 'string'
                    ? data.error
                    : 'order failed with status ' + res.status
                );
              }
              if (!data || typeof data.orderId !== 'string' || !Array.isArray(data.items)) {
                return errorResult('order service returned an unexpected response (status ' + res.status + ')');
              }
              return {
                content: [
                  {
                    type: 'text',
                    text: formatOrderResultText(
                      data.orderId,
                      data.items,
                      folded.deliveryDate,
                      typeof data.totalCents === 'number' ? data.totalCents : 0
                    ),
                  },
                ],
              };
            });
          });
        })
        .catch(function (err) {
          return errorResult(err && err.message ? err.message : 'unknown error');
        });
    };
  }

  // --- boot: fetch published tools and register them with the WebMCP runtime --

  function boot() {
    var modelContext = document.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') {
      console.info(
        '[ginga] no WebMCP runtime (document.modelContext) on this page — ' +
          STORE_SLUG + ' tools stay dormant.'
      );
      return;
    }

    fetch(GINGA_ORIGIN + '/api/tools')
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var tools = data && Array.isArray(data.tools) ? data.tools : [];
        var registered = 0;
        tools.forEach(function (tool) {
          if (!tool || typeof tool.name !== 'string' || !Array.isArray(tool.steps)) return;
          try {
            modelContext.registerTool({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              execute: makeExecute(tool),
            });
            registered++;
          } catch (err) {
            console.warn('[ginga] runtime rejected registration for', tool.name, err);
          }
        });
        console.info(
          '[ginga] ' + registered + ' tool(s) live for agents on "' + STORE_SLUG +
            '" (via document.modelContext).'
        );
      })
      .catch(function (err) {
        console.warn('[ginga] could not load tools from ' + GINGA_ORIGIN + ':', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
