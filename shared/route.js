// shared/route.js — given a TradingView ticker, decide which broker executes it.
//
// Single source of truth for "where does this order go". Used by:
//  - Claude (via the runbook in bridge/RUNBOOK.md)
//  - bridge/src/cli.js (CLI helper for testing/diagnostics)
//  - The MCPs themselves (defensive: if a wrong-asset order reaches kraken-mcp,
//    it can detect and refuse via this routing function)

import { mapToKraken, mapToCTrader } from './symbol-map.js';

/**
 * @typedef {Object} RouteDecision
 * @property {"kraken" | "forex" | null} broker
 * @property {string | null} broker_symbol   - the symbol in the broker's native format
 * @property {string} tv_symbol              - the original TradingView ticker
 * @property {string} reason                 - human-readable rationale
 */

/**
 * Decide which broker should execute an order for a given TradingView ticker.
 *
 * Routing rules:
 *  - Crypto exchanges (BINANCE, COINBASE, KRAKEN, BYBIT) → kraken-mcp
 *  - Forex/CFD/metals exchanges (ICMARKETS, OANDA, FX, FX_IDC, PEPPERSTONE) → forex-mcp
 *  - Macro indices (CRYPTOCAP, INDEX) → null (analysis-only, not tradeable)
 *  - Unknown exchanges → null with a "needs-mapping" reason
 *
 * @param {string} tvTicker - e.g. "BINANCE:BTCUSDT", "ICMARKETS:XAUUSD"
 * @returns {RouteDecision}
 */
export function routeSymbol(tvTicker) {
  if (typeof tvTicker !== 'string' || !tvTicker) {
    return { broker: null, broker_symbol: null, tv_symbol: tvTicker, reason: 'empty or non-string ticker' };
  }

  const exchange = tvTicker.includes(':') ? tvTicker.split(':')[0] : '';

  // Analysis-only: macro indices, market cap aggregates, etc.
  if (exchange === 'CRYPTOCAP' || exchange === 'INDEX' || exchange === 'TVC') {
    return {
      broker: null,
      broker_symbol: null,
      tv_symbol: tvTicker,
      reason: `${exchange} is an analysis-only ticker (macro/index aggregate, not tradeable)`,
    };
  }

  // Crypto: try mapping to Kraken
  const krakenSym = mapToKraken(tvTicker);
  if (krakenSym) {
    return {
      broker: 'kraken',
      broker_symbol: krakenSym,
      tv_symbol: tvTicker,
      reason: `${exchange} is a crypto exchange — routed to kraken-mcp as ${krakenSym}`,
    };
  }

  // Forex / CFD / metals
  const ctraderSym = mapToCTrader(tvTicker);
  if (ctraderSym) {
    return {
      broker: 'forex',
      broker_symbol: ctraderSym,
      tv_symbol: tvTicker,
      reason: `${exchange || 'no-exchange-prefix'} is a forex/CFD pair — routed to forex-mcp as ${ctraderSym}`,
    };
  }

  return {
    broker: null,
    broker_symbol: null,
    tv_symbol: tvTicker,
    reason: `Unknown exchange/instrument: "${tvTicker}". Add a mapping in shared/symbol-map.js if you want this tradeable.`,
  };
}

/**
 * The MCP tool name to call for a bracket order on the given broker.
 * Used by Claude to know which MCP namespace to invoke.
 */
export function bracketToolName(broker) {
  switch (broker) {
    case 'kraken': return 'mcp__kraken__kraken_place_bracket_order';
    case 'forex':  return 'mcp__forex__forex_place_bracket_order';
    default: return null;
  }
}
