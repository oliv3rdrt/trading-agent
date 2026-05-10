// shared/symbol-map.js — maps TradingView tickers to broker-specific symbols.
//
// Why this is its own module: TV uses exchange-prefixed tickers ("BINANCE:BTCUSDT"),
// each broker has its own naming convention. Centralizing keeps the per-MCP code
// from having to know about TV conventions, and vice versa.

// Kraken uses XBT instead of BTC, and slash-separated pairs like "XBT/USDT".
const KRAKEN_BASE_OVERRIDES = {
  BTC: 'XBT',
};

const KRAKEN_QUOTE_OVERRIDES = {
  // Kraken accepts both USDT and USD; we route to USDT where the TV ticker has it.
};

/**
 * Strip the exchange prefix from a TradingView ticker.
 * "BINANCE:BTCUSDT" → "BTCUSDT"
 */
export function stripExchange(tvTicker) {
  const colonIdx = tvTicker.indexOf(':');
  return colonIdx >= 0 ? tvTicker.slice(colonIdx + 1) : tvTicker;
}

/**
 * Split a concatenated pair like "BTCUSDT" into base + quote.
 * Returns null if no recognized quote is found.
 */
export function splitPair(concatPair) {
  // Try long quotes first to avoid splitting "BUSD" as B + USD
  const quotes = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'JPY'];
  for (const q of quotes) {
    if (concatPair.endsWith(q) && concatPair.length > q.length) {
      return { base: concatPair.slice(0, -q.length), quote: q };
    }
  }
  return null;
}

/**
 * Map a TradingView ticker to a Kraken symbol.
 * Returns null if the symbol can't be mapped (e.g. macro tickers, unsupported pairs).
 *
 * Examples:
 *   "BINANCE:BTCUSDT"   → "XBTUSDT"
 *   "BINANCE:ETHUSDT"   → "ETHUSDT"
 *   "CRYPTOCAP:TOTAL"   → null (macro, not tradeable)
 *   "ICMARKETS:XAUUSD"  → null (not on Kraken — forex)
 */
export function mapToKraken(tvTicker) {
  const exchange = tvTicker.split(':')[0];
  // Reject non-crypto exchanges and macro indices
  if (exchange === 'CRYPTOCAP' || exchange === 'ICMARKETS' || exchange === 'OANDA' || exchange === 'FX') {
    return null;
  }
  const pair = stripExchange(tvTicker);
  const parts = splitPair(pair);
  if (!parts) return null;
  const base = KRAKEN_BASE_OVERRIDES[parts.base] || parts.base;
  const quote = KRAKEN_QUOTE_OVERRIDES[parts.quote] || parts.quote;
  return `${base}${quote}`;
}

/**
 * Reverse: a Kraken symbol → human-readable display.
 *   "XBTUSDT" → "BTC/USDT"
 */
export function krakenSymbolDisplay(krakenSym) {
  // Try to split with known quotes
  const parts = splitPair(krakenSym);
  if (!parts) return krakenSym;
  const reverseMap = Object.fromEntries(Object.entries(KRAKEN_BASE_OVERRIDES).map(([k, v]) => [v, k]));
  const base = reverseMap[parts.base] || parts.base;
  return `${base}/${parts.quote}`;
}
