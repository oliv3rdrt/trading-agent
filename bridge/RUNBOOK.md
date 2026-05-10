# Runbook — Execute a chart setup

For Claude (or any agent) to use when the user says **"execute the long/short
setup on the chart"** or similar.

Procedure assumes all three MCPs are registered with Claude Code:
`tradingview`, `kraken`, `forex`.

## The flow

```
1. READ chart state (tradingview MCP)
        │ symbol, timeframe, current quote
        ▼
2. READ drawn levels (tradingview MCP)
        │ entry zone, stop, TPs (from rectangles/lines on chart)
        ▼
3. ROUTE — which broker? (shared/route.js)
        │ BINANCE:* → kraken, ICMARKETS:* → forex, CRYPTOCAP:* → refuse
        ▼
4. PROPOSE — present trade summary to user, wait for "execute" confirmation
        │ entry, stop, TPs, computed size, R:R, risk amount
        ▼
5. EXECUTE — call the broker MCP's bracket_order tool
        │ paper fill (PAPER_TRADING=1) or live (PAPER_TRADING=0)
        ▼
6. CONFIRM — show order ID, audit log path, next action (monitor)
```

## Step-by-step

### Step 1: Read chart state

Call **`mcp__tradingview__tv_health_check`** to confirm CDP is connected, then
**`mcp__tradingview__chart_get_state`** to get the symbol + timeframe.

If `chart_ready` is false, wait 2s and retry once.

### Step 2: Read the levels

The user's drawings encode the trade plan. Get them via:

- **`mcp__tradingview__data_get_pine_lines`** — horizontal lines (stops, TPs, refs)
- **`mcp__tradingview__data_get_pine_boxes`** — rectangle zones (entry zones)

If both return empty, ask the user to specify entry/stop/TPs explicitly.

Identify the trade:
- Find the rectangle labelled "BUY ZONE" or "SELL ZONE" → entry zone
- Find horizontal lines labelled "LONG STOP" / "SHORT STOP" → stop
- Find horizontal lines labelled "LONG TP1/TP2/TP3" or "SHORT TP1/TP2/TP3" → take-profits

If labels are ambiguous, ask the user to clarify which setup (LONG vs SHORT).

### Step 3: Route to the right broker

Use the routing function (or call `node bridge/src/cli.js route <TV_TICKER>` for
manual verification). It returns:

```json
{
  "broker": "kraken" | "forex" | null,
  "broker_symbol": "XBTUSDT",
  "bracket_tool": "mcp__kraken__kraken_place_bracket_order"
}
```

If `broker` is `null`, the symbol is analysis-only (e.g. `CRYPTOCAP:TOTAL`). **Refuse**
and tell the user this ticker can't be traded.

### Step 4: Propose to the user

Before placing the order, show:

```
Routing:  BINANCE:BTCUSDT → kraken (XBTUSDT)
Side:     LONG
Entry:    81000 (mid of BUY ZONE)
Stop:     80000
TPs:      83500 / 85000 / 87500
Risk:     ~$100 (1% of $10000 balance per rules.json)
Size:     0.1 BTC
R:R:      2.5 to TP1
Mode:     PAPER (no real order will be submitted)

Confirm to execute? (yes / no / change <field>)
```

If the user says yes, proceed. If no, abort. If "change", ask which field.

### Step 5: Execute

Call the broker's bracket tool with the validated params. Example for Kraken:

```
mcp__kraken__kraken_place_bracket_order({
  symbol: "BINANCE:BTCUSDT",        // either TV ticker or broker symbol works
  side: "long",
  entry: 81000,
  stop: 80000,
  take_profits: [83500, 85000, 87500],
  reasoning: "BUY ZONE pullback on BTCUSDT — 4H structure intact, R:R 2.5 to TP1"
})
```

For Forex (ICMARKETS:XAUUSD etc), call `mcp__forex__forex_place_bracket_order` instead.

### Step 6: Confirm and document

The broker MCP returns:

```json
{
  "success": true,
  "paper": true,
  "order_id": "PAPER-XXXX",
  "fills": { ... },
  "audit_logged": true
}
```

Show the user the order ID and tell them:
- The order has been logged to `~/trading-agent/audit-log.jsonl`
- It's a paper fill (no real funds moved) if `paper: true`
- Suggest next step: monitor the chart for the fill condition, or set a TradingView alert

## What NOT to do

- **Don't skip step 4.** Always show the trade summary and wait for explicit "yes". Trading code should never auto-execute without confirmation, even in paper mode.
- **Don't override `rules.json` violations.** If the bracket tool refuses (R:R < 2, wrong-side stop, etc.), surface the violations and stop. Don't propose alternative numbers that bypass the rules.
- **Don't trade `CRYPTOCAP:*` or other macro tickers.** Routing returns `null` for these — refuse and tell the user.
- **Don't expose API keys.** Read `.env` only via `process.env` — never echo, never log, never paste into chat.

## Quick test (no chart needed)

```bash
node ~/trading-agent/bridge/src/cli.js route BINANCE:BTCUSDT
node ~/trading-agent/bridge/src/cli.js route ICMARKETS:XAUUSD
node ~/trading-agent/bridge/src/cli.js route CRYPTOCAP:TOTAL    # should return null
```
