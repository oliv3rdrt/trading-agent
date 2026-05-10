# bridge/

Glue layer that turns TradingView signals into broker orders.

## Status

✅ Phase 3 complete. The bridge is **a routing function + a procedural runbook**,
not another MCP. Claude orchestrates the flow by following `RUNBOOK.md` and
calling the existing kraken-mcp and forex-mcp tools directly.

## Setup — register all three MCPs with Claude Code

Add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["/Users/<you>/tradingview-mcp/src/server.js"]
    },
    "kraken": {
      "command": "node",
      "args": ["/Users/<you>/trading-agent/kraken-mcp/src/server.js"],
      "env": { "PAPER_TRADING": "1" }
    },
    "forex": {
      "command": "node",
      "args": ["/Users/<you>/trading-agent/forex-mcp/src/server.js"],
      "env": { "PAPER_TRADING": "1" }
    }
  }
}
```

Restart Claude Code. All three MCPs load.

## Usage

When the user asks Claude to **"execute the long/short setup on the chart"**,
Claude follows [`RUNBOOK.md`](./RUNBOOK.md): reads chart state from
tradingview-mcp, identifies the symbol, calls `routeSymbol()` to pick the
right broker, validates against `rules.json`, presents the trade summary,
waits for "yes", then submits via the appropriate broker MCP.

## Tests

```bash
node --test bridge/tests/route.test.js   # 8 tests, all symbol-routing edges
node bridge/src/cli.js route BINANCE:BTCUSDT
node bridge/src/cli.js route ICMARKETS:XAUUSD
node bridge/src/cli.js route CRYPTOCAP:TOTAL    # returns null (analysis-only)
```

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
