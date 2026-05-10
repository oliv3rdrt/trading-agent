# bridge/

Glue layer that turns TradingView signals into broker orders.

## Status

🔲 Phase 3 — implemented after Kraken MCP (Phase 1) and Forex MCP (Phase 2) are working.

## What it does

1. Reads chart state from `tradingview-mcp` (e.g. price tagged BUY ZONE 4697-4704)
2. Looks up the broker for that symbol via `shared/symbol-map.ts`
3. Validates the trade against `rules.json` (min R:R, max risk%, no-trade windows)
4. Composes a bracket order (entry + stop + TPs) using the broker's MCP
5. Logs the full chain to `audit-log.jsonl`

## Symbol mapping examples

| TradingView ticker        | Routed to     | Broker symbol |
|---------------------------|---------------|---------------|
| `BINANCE:BTCUSDT`         | kraken-mcp    | `XBT/USDT`    |
| `BINANCE:ETHUSDT`         | kraken-mcp    | `ETH/USDT`    |
| `ICMARKETS:XAUUSD`        | forex-mcp     | `XAU_USD`     |
| `OANDA:EURUSD`            | forex-mcp     | `EUR_USD`     |

`CRYPTOCAP:*` and other index/macro tickers are analysis-only — bridge refuses to route them.
