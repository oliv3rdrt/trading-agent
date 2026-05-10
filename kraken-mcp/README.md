# kraken-mcp

MCP server exposing Kraken (crypto) read + write operations as named tools.

## Status

⏳ Phase 1 — not yet implemented. Next up after scaffold.

## Planned tool surface

**Read (safe to wildcard-allow):**
- `kraken_get_balance`
- `kraken_get_ticker`
- `kraken_get_orderbook`
- `kraken_get_positions`
- `kraken_get_orders`
- `kraken_get_trades`

**Write (require explicit confirmation):**
- `kraken_place_limit_order`
- `kraken_place_market_order`
- `kraken_cancel_order`
- `kraken_modify_order` (Kraken's edit-order)

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
