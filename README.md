# trading-agent

Personal trading-execution layer for Claude Code. Bridges TradingView chart
analysis to broker order execution, gated by `rules.json` for risk management.

## Architecture

```
TradingView MCP (analysis layer — read chart, draw setups, compute levels)
                              │
                              ▼
                          Claude Code
                              │
                  ┌───────────┴───────────┐
                  │  reads rules.json     │
                  │  enforces R:R, size,  │
                  │  no-trade windows     │
                  └───────────┬───────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        Kraken MCP                      Forex MCP
   (crypto execution —             (XAUUSD + FX/CFD execution —
    BTC, ETH, SOL, etc.)            broker TBD: OANDA / cTrader / MT5)
```

## Phases

| # | Phase                  | Folder         | Status |
|---|------------------------|----------------|--------|
| 0 | Scaffold (this commit) | _root_         | ✅      |
| 1 | Kraken MCP (paper)     | `kraken-mcp/`  | ✅      |
| 2a | Forex MCP via cTrader (paper) | `forex-mcp/` | ✅    |
| 3 | TV→broker bridge       | `bridge/`      | 🔲      |
| 4 | Safety rails           | `shared/`      | 🔲      |

## Folders

- **`shared/`** — rules-loader, risk gates, audit log writer, symbol mapping.
  Reused by both MCPs to avoid duplication.
- **`kraken-mcp/`** — MCP server exposing Kraken read + write tools.
- **`forex-mcp/`** — MCP server for forex/CFD execution. Broker choice
  affects implementation but tool surface stays the same.
- **`bridge/`** — wiring that turns a TradingView signal ("BTC tagged
  the BUY ZONE") into a broker order via the right MCP.
- **`rules.json`** — trading config (R:R floor, risk %, no-trade hours,
  watchlist). Shared with `~/tradingview-mcp/rules.json`.

## Setup

```bash
git clone git@github.com:oliv3rdrt/trading-agent.git
cd trading-agent
cp .env.example .env       # fill in API keys, NEVER commit
# Per MCP, once built:
cd kraken-mcp && npm install
```

Register each MCP with Claude Code by adding to `~/.claude/.mcp.json`
(per-MCP README documents the exact entry).

## Safety

1. **Paper trading default.** `.env` ships with `PAPER_TRADING=1` which blocks
   every real-money call path. Flip to `0` only after a full week of paper
   trading confirms the loop works end-to-end.
2. **API keys are gitignored.** `.env` and `credentials/` never enter git.
   Create broker API keys with the **smallest possible permission set**
   (Kraken: no "withdraw funds"; OANDA: read+trade only, no transfers).
3. **`rules.json` is enforced, not advisory.** Every order Claude composes is
   validated against the rules before submission. Min R:R, max risk %,
   no-trade windows: hard refusals, not warnings.
4. **Audit log.** Every order (paper or live) is appended to
   `audit-log.jsonl` (gitignored) with timestamp, prices, computed R:R, and
   the chart-state snapshot that justified it.
5. **No autonomous trading at first.** Phase 1–3 require explicit human
   "execute" confirmation per trade. Autonomous mode (if ever added)
   is a separate phase with its own gates.

## License

Personal use only. Not open-sourced.
