# forex-mcp

MCP server exposing forex/CFD broker read + write operations.

## Status

🔲 Phase 2 — broker choice still pending.

## Broker options (decision needed before Phase 2 starts)

| Broker | Pros | Cons |
|---|---|---|
| **OANDA REST** | Clean docs, free, gold + all majors, demo trivial | New account needed |
| **cTrader Open API** | Free official, works with IC Markets cTrader sub-account | OAuth2 + WebSocket complexity |
| **MetaAPI.cloud (MT5)** | Keeps IC Markets MT5 setup | Paid (~$15/mo), 3rd-party intermediary |

Default recommendation: **OANDA** (lowest friction).

## Planned tool surface

Same shape as `kraken-mcp` for consistency:

**Read:**
- `forex_get_balance`
- `forex_get_price`
- `forex_get_positions`
- `forex_get_orders`

**Write:**
- `forex_place_limit_order`
- `forex_place_market_order`
- `forex_place_bracket_order` (entry + stop + multiple TPs as atomic group)
- `forex_cancel_order`
- `forex_close_position`
