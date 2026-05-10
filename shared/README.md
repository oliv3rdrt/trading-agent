# shared/

Library code reused by both MCPs.

Planned modules (filled in during Phase 4):

- `rules-loader.ts` — load and validate `rules.json`
- `risk-gates.ts` — refuses orders that fail min R:R, exceed max risk%, or fall in no-trade windows
- `audit-log.ts` — JSONL writer for every order (paper or live)
- `symbol-map.ts` — TradingView ticker → broker symbol translation
- `paper-broker.ts` — stub broker that prints orders instead of submitting them, used when `PAPER_TRADING=1`

## Status

🔲 Not yet implemented — placeholder for Phase 4.
