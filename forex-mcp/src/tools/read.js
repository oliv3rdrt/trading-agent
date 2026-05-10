// forex-mcp/src/tools/read.js — read-only tools for cTrader.
//
// All endpoints here are SAFE to allowlist (`mcp__forex__forex_get_*`).
// They never move money. Most need an authenticated connection (run `npm run auth`).

import { getCTrader } from '../ctrader-client.js';
import { mapToCTrader } from '../../../shared/symbol-map.js';

function resolveSymbol(symbol) {
  if (symbol.includes(':')) {
    const m = mapToCTrader(symbol);
    if (!m) throw new Error(`Cannot map ${symbol} to a cTrader symbol`);
    return m;
  }
  return symbol;
}

export function registerReadTools(tools) {
  tools.set('forex_get_account', {
    name: 'forex_get_account',
    description: 'Get the connected cTrader account summary: balance, equity, margin, broker, currency.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const ct = await getCTrader();
      const acct = await ct.account.getAccountState();
      return {
        account_id: ct.config?.accountId,
        balance: acct.balance,
        equity: acct.equity,
        margin_used: acct.usedMargin,
        free_margin: acct.freeMargin,
        currency: acct.depositAssetId, // may be a numeric asset id; the high-level lib may expose a name field too
      };
    },
  });

  tools.set('forex_get_price', {
    name: 'forex_get_price',
    description: 'Get the latest bid/ask spot price for a symbol. Accepts TV ticker ("ICMARKETS:XAUUSD") or bare pair ("XAUUSD").',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      const ct = await getCTrader();
      const sym = resolveSymbol(symbol);
      const quote = await ct.market.subscribeSpot(sym).next(); // first tick
      return {
        symbol: sym,
        bid: quote.bid,
        ask: quote.ask,
        timestamp: quote.timestamp,
      };
    },
  });

  tools.set('forex_get_positions', {
    name: 'forex_get_positions',
    description: 'List currently open positions on the connected account.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const ct = await getCTrader();
      const positions = await ct.account.getPositions();
      return {
        count: positions.length,
        positions: positions.map(p => ({
          position_id: p.positionId,
          symbol: p.symbolId,         // numeric; will resolve to name in a future enhancement
          side: p.tradeSide,
          volume: p.volume,
          entry: p.price,
          unrealized_pnl: p.unrealizedNetProfit,
          stop_loss: p.stopLoss,
          take_profit: p.takeProfit,
        })),
      };
    },
  });

  tools.set('forex_get_orders', {
    name: 'forex_get_orders',
    description: 'List open (pending) orders — limit and stop orders not yet filled.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const ct = await getCTrader();
      const orders = await ct.account.getOrders();
      return {
        count: orders.length,
        orders: orders.map(o => ({
          order_id: o.orderId,
          symbol: o.symbolId,
          side: o.tradeSide,
          order_type: o.orderType,
          volume: o.requestedVolume,
          price: o.limitPrice || o.stopPrice,
          status: o.orderStatus,
        })),
      };
    },
  });

  tools.set('forex_get_deals', {
    name: 'forex_get_deals',
    description: 'List recent filled deals (closed trades).',
    inputSchema: {
      type: 'object',
      properties: {
        from_unix: { type: 'integer', description: 'Unix timestamp lower bound (defaults to 30 days ago)' },
        to_unix: { type: 'integer', description: 'Unix timestamp upper bound (defaults to now)' },
      },
    },
    handler: async ({ from_unix, to_unix }) => {
      const ct = await getCTrader();
      const to = to_unix ?? Math.floor(Date.now() / 1000);
      const from = from_unix ?? to - 30 * 86400;
      const deals = await ct.account.getDeals({ fromTimestamp: from * 1000, toTimestamp: to * 1000 });
      return {
        count: deals.length,
        deals: deals.map(d => ({
          deal_id: d.dealId,
          position_id: d.positionId,
          symbol: d.symbolId,
          side: d.tradeSide,
          volume: d.volume,
          price: d.executionPrice,
          timestamp: d.executionTimestamp,
        })),
      };
    },
  });
}
