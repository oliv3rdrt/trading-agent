// kraken-mcp/src/tools/read.js — read-only tools.
//
// All endpoints here are SAFE to allowlist with wildcards: they never move money.
// Public endpoints work without API keys; private endpoints (balance, orders)
// need KRAKEN_API_KEY/SECRET.

import { mapToKraken, krakenSymbolDisplay } from '../../../shared/symbol-map.js';

export function registerReadTools(tools, kraken) {
  tools.set('kraken_get_ticker', {
    name: 'kraken_get_ticker',
    description: 'Get the latest price snapshot for a Kraken pair. Accepts a TradingView ticker (e.g. "BINANCE:BTCUSDT") or a Kraken pair directly ("XBTUSDT").',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'TV ticker or Kraken pair' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      const krakenSym = symbol.includes(':') ? mapToKraken(symbol) : symbol;
      if (!krakenSym) throw new Error(`Symbol ${symbol} can't be mapped to a Kraken pair`);
      const result = await kraken.public('Ticker', { pair: krakenSym });
      const pairKey = Object.keys(result)[0];
      const t = result[pairKey];
      return {
        symbol: krakenSym,
        display: krakenSymbolDisplay(krakenSym),
        last: parseFloat(t.c[0]),
        bid: parseFloat(t.b[0]),
        ask: parseFloat(t.a[0]),
        volume_24h: parseFloat(t.v[1]),
        vwap_24h: parseFloat(t.p[1]),
        low_24h: parseFloat(t.l[1]),
        high_24h: parseFloat(t.h[1]),
      };
    },
  });

  tools.set('kraken_get_orderbook', {
    name: 'kraken_get_orderbook',
    description: 'Get the current bid/ask order book for a pair. Returns top N levels each side.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        depth: { type: 'integer', description: 'Number of levels per side (1-500)', default: 10 },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol, depth = 10 }) => {
      const krakenSym = symbol.includes(':') ? mapToKraken(symbol) : symbol;
      if (!krakenSym) throw new Error(`Symbol ${symbol} can't be mapped to a Kraken pair`);
      const result = await kraken.public('Depth', { pair: krakenSym, count: depth });
      const pairKey = Object.keys(result)[0];
      const ob = result[pairKey];
      return {
        symbol: krakenSym,
        bids: ob.bids.map(([p, q, t]) => ({ price: parseFloat(p), size: parseFloat(q), ts: t })),
        asks: ob.asks.map(([p, q, t]) => ({ price: parseFloat(p), size: parseFloat(q), ts: t })),
      };
    },
  });

  tools.set('kraken_get_balance', {
    name: 'kraken_get_balance',
    description: 'Get account balances by asset. Requires API key.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const result = await kraken.private('Balance');
      // Result is { ZUSD: "123.45", XXBT: "0.5", ... }
      // Normalize the Kraken asset codes for readability.
      const normalized = {};
      for (const [k, v] of Object.entries(result)) {
        const display = k.startsWith('X') || k.startsWith('Z') ? k.slice(1) : k;
        normalized[display] = parseFloat(v);
      }
      return { balances: normalized, raw: result };
    },
  });

  tools.set('kraken_get_open_orders', {
    name: 'kraken_get_open_orders',
    description: 'List all currently open orders on the account.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const result = await kraken.private('OpenOrders');
      return { open: result.open || {}, count: Object.keys(result.open || {}).length };
    },
  });

  tools.set('kraken_get_positions', {
    name: 'kraken_get_positions',
    description: 'List open margin/futures positions. (Spot has no positions — only balances.)',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const result = await kraken.private('OpenPositions');
      return { positions: result || {}, count: Object.keys(result || {}).length };
    },
  });

  tools.set('kraken_get_trades_history', {
    name: 'kraken_get_trades_history',
    description: 'List recent fills (closed trades). Defaults to last 50.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: 'Number of trades to return', default: 50 },
      },
    },
    handler: async ({ count = 50 }) => {
      const result = await kraken.private('TradesHistory');
      const trades = Object.entries(result.trades || {}).slice(0, count).map(([id, t]) => ({
        id, ...t,
      }));
      return { trades, total: result.count };
    },
  });
}
