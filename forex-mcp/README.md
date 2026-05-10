# forex-mcp

MCP server exposing forex/CFD broker read + write operations via cTrader Open API.

## Status

✅ Phase 2a complete (paper trading only): 5 read tools + 3 write tools wired,
all 6 smoke tests passing, MCP protocol handshake verified end-to-end.
Live order submission is intentionally not implemented yet — write tools
throw if `PAPER_TRADING=0`. Wire live in Phase 2b after a week of paper.

**Broker choice:** cTrader Open API (works with IC Markets, Pepperstone, FxPro,
and most other cTrader brokers via your existing trading account).

## Tool surface (as built)

**Read** (require an authenticated cTrader session — see Setup):

| Tool | Purpose |
|---|---|
| `forex_get_account` | Balance, equity, margin |
| `forex_get_price` | Latest bid/ask for a symbol |
| `forex_get_positions` | Currently open positions |
| `forex_get_orders` | Pending orders |
| `forex_get_deals` | Recent fills (defaults to last 30 days) |

**Write** (paper-only in Phase 2a, gated by `shared/risk.js` validation):

| Tool | Purpose |
|---|---|
| `forex_place_bracket_order` | Entry + stop + multiple TPs. Validated against `rules.json`. |
| `forex_place_limit_order` | Single-leg limit. |
| `forex_cancel_order` | Cancel by order ID. |

## Setup

### 1. Register a cTrader Open API application

Go to https://openapi.ctrader.com and register a new app with:
- Redirect URI: `http://localhost:8080/callback`
- Permission: **Access your accounts and trade**

Copy the resulting **Client ID** and **Client Secret** into `.env`:

```
CTRADER_CLIENT_ID=...
CTRADER_CLIENT_SECRET=...
```

### 2. Install + auth

```bash
cd forex-mcp
npm install
npm run auth      # one-time: opens browser, captures OAuth token, picks account, writes to .env
```

This populates `CTRADER_ACCESS_TOKEN`, `CTRADER_REFRESH_TOKEN`, `CTRADER_ACCOUNT_ID`
in `.env` (gitignored).

### 3. Run

```bash
PAPER_TRADING=1 node src/server.js
```

Register with Claude Code by adding to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "forex": {
      "command": "node",
      "args": ["/Users/oliveranyanwu_main/trading-agent/forex-mcp/src/server.js"],
      "env": { "PAPER_TRADING": "1" }
    }
  }
}
```

## Tests

```bash
cd forex-mcp
node --test tests/smoke.test.js
```

6 tests pass: symbol mapping (cTrader + Kraken cross-check), R:R validation,
paper-broker forex bracket order, audit log entry shape.
