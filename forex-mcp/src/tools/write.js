// forex-mcp/src/tools/write.js — order-placement tools.
//
// Same shape as kraken-mcp/tools/write.js: validate against rules.json,
// then either delegate to paper-broker (PAPER_TRADING=1) or throw
// "not yet implemented for live" (PAPER_TRADING=0).

import { loadRules } from '../../../shared/rules-loader.js';
import { validateOrder } from '../../../shared/risk.js';
import { paperPlaceBracket, paperPlaceSingle, paperCancel } from '../../../shared/paper-broker.js';
import { mapToCTrader } from '../../../shared/symbol-map.js';
import { getCTrader } from '../ctrader-client.js';

function liveNotImplemented(toolName) {
  throw new Error(
    `${toolName}: LIVE mode is not implemented in Phase 2a. Set PAPER_TRADING=1 to use paper mode, ` +
    `or wire live submission via ctrader-ts in a Phase 2b/2c after verifying paper for at least a week.`
  );
}

function resolveSymbol(symbol) {
  if (symbol.includes(':')) {
    const m = mapToCTrader(symbol);
    if (!m) throw new Error(`Cannot map ${symbol} to a cTrader symbol`);
    return { ctrader_symbol: m, tv_symbol: symbol };
  }
  return { ctrader_symbol: symbol, tv_symbol: null };
}

async function accountBalance() {
  // Try the real account; fall back to demo balance if not authed.
  try {
    const ct = await getCTrader();
    const acct = await ct.account.getAccountState();
    return acct.balance;
  } catch {
    return 10_000; // paper-mode demo balance when no auth yet
  }
}

export function registerWriteTools(tools, { paper }) {
  tools.set('forex_place_bracket_order', {
    name: 'forex_place_bracket_order',
    description: [
      'Place a bracket order on the cTrader account: entry (limit) + stop-loss + one or more take-profits.',
      'Position size computed from rules.json max_risk_per_trade and the account balance. Refuses if R:R < min_rr_ratio.',
      'In paper mode (default), no real order is submitted — logged to audit-log.jsonl and a synthetic fill is returned.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'TV ticker (e.g. "ICMARKETS:XAUUSD") or bare cTrader pair' },
        side: { type: 'string', enum: ['long', 'short'] },
        entry: { type: 'number' },
        stop: { type: 'number' },
        take_profits: { type: 'array', items: { type: 'number' }, minItems: 1 },
        reasoning: { type: 'string' },
      },
      required: ['symbol', 'side', 'entry', 'stop', 'take_profits'],
    },
    handler: async ({ symbol, side, entry, stop, take_profits, reasoning }) => {
      const { ctrader_symbol, tv_symbol } = resolveSymbol(symbol);
      const rules = loadRules();
      const balance = await accountBalance();

      const validation = validateOrder({ side, entry, stop, take_profits, balance }, rules);
      if (!validation.ok) {
        return { success: false, refused: true, violations: validation.violations };
      }

      const { size, risk_amount, rr_to_tp1 } = validation.computed;

      if (paper) {
        return paperPlaceBracket({
          broker: 'forex',
          symbol: ctrader_symbol,
          tv_symbol,
          side, entry, stop, take_profits,
          size, risk_amount, rr_to_tp1,
          reasoning: reasoning || '',
        });
      }
      liveNotImplemented('forex_place_bracket_order');
    },
  });

  tools.set('forex_place_limit_order', {
    name: 'forex_place_limit_order',
    description: 'Single-leg limit order. Use only when bracket is not appropriate (e.g. manual exit).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        price: { type: 'number' },
        size: { type: 'number', description: 'Units (not lots). 100,000 units = 1 standard lot for most FX.' },
        reasoning: { type: 'string' },
      },
      required: ['symbol', 'side', 'price', 'size'],
    },
    handler: async ({ symbol, side, price, size, reasoning }) => {
      const { ctrader_symbol, tv_symbol } = resolveSymbol(symbol);
      if (paper) {
        return paperPlaceSingle({
          broker: 'forex',
          symbol: ctrader_symbol,
          tv_symbol,
          side: side === 'buy' ? 'long' : 'short',
          order_type: 'limit',
          price, size, reasoning,
        });
      }
      liveNotImplemented('forex_place_limit_order');
    },
  });

  tools.set('forex_cancel_order', {
    name: 'forex_cancel_order',
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
      if (paper) return paperCancel({ broker: 'forex', order_id, reason });
      liveNotImplemented('forex_cancel_order');
    },
  });
}
