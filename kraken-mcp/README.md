# kraken-mcp

MCP server exposing Kraken (crypto) read + write operations as named tools.

## Status

✅ Phase 1 complete (paper trading only). Live order-submission is intentionally
not wired yet — write tools throw if `PAPER_TRADING=0`. Wire live in a
follow-up after the paper loop has been verified end-to-end for at least a week.

## Tool surface (as built)

**Read** (safe to wildcard-allow with `mcp__kraken__kraken_get_*`):

| Tool | Purpose |
|---|---|
| `kraken_get_ticker` | Latest price snapshot for a pair (accepts TV ticker or Kraken pair) |
| `kraken_get_orderbook` | Top-N levels each side |
| `kraken_get_balance` | All account balances |
| `kraken_get_open_orders` | Currently open orders |
| `kraken_get_positions` | Open margin/futures positions |
| `kraken_get_trades_history` | Recent fills |

**Write** (paper-only in Phase 1, gated by risk validation):

| Tool | Purpose |
|---|---|
| `kraken_place_bracket_order` | Entry + stop + multiple TPs. Validated against `rules.json` (min R:R, max risk %). |
| `kraken_place_limit_order` | Single-leg limit. Use only when bracket isn't appropriate. |
| `kraken_cancel_order` | Cancel an open order by ID. |

## Setup

```bash
cd kraken-mcp
npm install
PAPER_TRADING=1 node src/server.js   # paper mode (no real orders)
```

For read tools to query real account state, set `KRAKEN_API_KEY` and
`KRAKEN_API_SECRET` in the repo's `.env`. Without them, public endpoints
(ticker, orderbook) still work; private endpoints (balance, orders) will
error.

## Tests

```bash
cd kraken-mcp
node --test tests/smoke.test.js
```

Tests cover symbol mapping, rules loading, risk validation (accept + reject
paths), and the paper-broker audit log. No real network calls.

## Auth

Reads `KRAKEN_API_KEY` and `KRAKEN_API_SECRET` from environment (`.env`).
Create the key at https://www.kraken.com/u/security/api with **withdraw
permission DISABLED**.

## Register with Claude Code

Once built, add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "kraken": {
      "command": "node",
      "args": ["/Users/oliveranyanwu_main/trading-agent/kraken-mcp/src/server.js"],
      "env": {
        "PAPER_TRADING": "1"
      }
    }
  }
}
```
