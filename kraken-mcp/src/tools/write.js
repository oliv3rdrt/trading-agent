// kraken-mcp/src/tools/write.js — order-placement tools.
//
// In PAPER mode: delegates to shared/paper-broker.js (no real orders).
// In LIVE mode: throws — Phase 1 ships paper-only. Live wiring lands in a
// follow-up phase after the paper loop is verified for at least a week.
//
// The risk gate (validateOrder) runs BEFORE either path so paper and live
// share identical safety checks.

import { loadRules } from '../../../shared/rules-loader.js';
import { validateOrder } from '../../../shared/risk.js';
import { paperPlaceBracket, paperPlaceSingle, paperCancel } from '../../../shared/paper-broker.js';
import { mapToKraken } from '../../../shared/symbol-map.js';

function liveNotImplemented(toolName) {
  throw new Error(
    `${toolName}: LIVE mode is not implemented in Phase 1. Set PAPER_TRADING=1 to use paper mode, ` +
    `or implement the live path in tools/write.js and re-verify on a week of paper trading first.`
  );
}

/**
 * Resolve a symbol input (TV ticker or Kraken pair) to a Kraken pair.
 * Returns { kraken_symbol, tv_symbol }.
 */
function resolveSymbol(symbolInput) {
  if (symbolInput.includes(':')) {
    const k = mapToKraken(symbolInput);
    if (!k) throw new Error(`Cannot map ${symbolInput} to a Kraken pair`);
    return { kraken_symbol: k, tv_symbol: symbolInput };
  }
  return { kraken_symbol: symbolInput, tv_symbol: null };
}

/**
 * Pull current balance in the quote currency of the pair.
 * For BTC/USDT this returns the USDT balance. Used to size risk %.
 */
async function quoteBalance(kraken, krakenSym) {
  // Heuristic: last 3-4 chars are the quote. Match USDT/USDC first.
  const quote = ['USDT', 'USDC', 'USD', 'EUR'].find(q => krakenSym.endsWith(q));
  if (!quote) throw new Error(`Cannot determine quote currency of ${krakenSym}`);
  const balances = await kraken.private('Balance');
  // Kraken uses ZUSD for USD; USDT/USDC stay as-is.
  const candidates = [quote, `Z${quote}`, `X${quote}`];
  for (const key of candidates) {
    if (balances[key] != null) return parseFloat(balances[key]);
  }
  return 0;
}

export function registerWriteTools(tools, kraken, { paper }) {
  // --- BRACKET ORDER (the primary write tool — entry + stop + multiple TPs) ---
  tools.set('kraken_place_bracket_order', {
    name: 'kraken_place_bracket_order',
    description: [
      'Place a bracket order: entry (limit) + stop-loss + one or more take-profits, sized to risk',
      'max_risk_per_trade % of the quote balance per rules.json. Refuses if R:R to TP1 < min_rr_ratio.',
      'In paper mode (default) records to audit-log.jsonl and returns a synthetic fill.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'TV ticker or Kraken pair' },
        side: { type: 'string', enum: ['long', 'short'] },
        entry: { type: 'number', description: 'Limit entry price' },
        stop: { type: 'number', description: 'Stop-loss price' },
        take_profits: {
          type: 'array',
          items: { type: 'number' },
          description: 'One or more TP prices, nearest first',
          minItems: 1,
        },
        reasoning: { type: 'string', description: 'Why this trade — captured in audit log' },
        confirmed: { type: 'boolean', description: 'Set to true to authorize orders whose notional exceeds confirm_above_notional_usd' },
      },
      required: ['symbol', 'side', 'entry', 'stop', 'take_profits'],
    },
    handler: async ({ symbol, side, entry, stop, take_profits, reasoning, confirmed }) => {
      const { kraken_symbol, tv_symbol } = resolveSymbol(symbol);
      const rules = loadRules();
      const balance = paper && !process.env.KRAKEN_API_KEY
        ? 10_000 // paper mode without API keys: assume a $10k account for sizing demo
        : await quoteBalance(kraken, kraken_symbol);

      const validation = validateOrder({ side, entry, stop, take_profits, balance, confirmed }, rules);
      if (!validation.ok) {
        return { success: false, refused: true, violations: validation.violations };
      }

      const { size, risk_amount, rr_to_tp1 } = validation.computed;

      if (paper) {
        return paperPlaceBracket({
          broker: 'kraken',
          symbol: kraken_symbol,
          tv_symbol,
          side, entry, stop, take_profits,
          size, risk_amount, rr_to_tp1,
          reasoning: reasoning || '',
        });
      }
      liveNotImplemented('kraken_place_bracket_order');
    },
  });

  // --- SINGLE LIMIT ORDER (occasional manual use) ---
  tools.set('kraken_place_limit_order', {
    name: 'kraken_place_limit_order',
    description: 'Single-leg limit order. No bracket. Use only when you explicitly need a one-sided position (e.g. closing a manual fill).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        price: { type: 'number' },
        size: { type: 'number', description: 'Size in base currency' },
        reasoning: { type: 'string' },
      },
      required: ['symbol', 'side', 'price', 'size'],
    },
    handler: async ({ symbol, side, price, size, reasoning }) => {
      const { kraken_symbol, tv_symbol } = resolveSymbol(symbol);
      if (paper) {
        return paperPlaceSingle({
          broker: 'kraken',
          symbol: kraken_symbol,
          tv_symbol,
          side: side === 'buy' ? 'long' : 'short',
          order_type: 'limit',
          price, size, reasoning,
        });
      }
      liveNotImplemented('kraken_place_limit_order');
    },
  });

  // --- CANCEL ---
  tools.set('kraken_cancel_order', {
    name: 'kraken_cancel_order',
    description: 'Cancel an open order by ID. In paper mode logs the cancel intent.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['order_id'],
    },
    handler: async ({ order_id, reason }) => {
      if (paper) return paperCancel({ broker: 'kraken', order_id, reason });
      liveNotImplemented('kraken_cancel_order');
    },
  });
}
