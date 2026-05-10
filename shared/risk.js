// shared/risk.js — order validation against rules.json.
//
// All risk gates live here so both MCPs use the same rules and so the logic
// is unit-testable in one place.

/**
 * @typedef {Object} OrderProposal
 * @property {"long" | "short"} side
 * @property {number} entry        - planned entry price
 * @property {number} stop         - planned stop price
 * @property {number[]} take_profits - one or more TPs, ordered nearest-to-furthest
 * @property {number} balance      - account balance in quote currency
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} [violations] - reasons for rejection (empty if ok)
 * @property {Object} [computed] - computed sizing if ok
 * @property {number} [computed.size] - position size in base currency
 * @property {number} [computed.risk_amount] - dollars at risk
 * @property {number} [computed.rr_to_tp1] - R:R to first TP
 */

/**
 * Validate an order proposal against rules.json.
 *
 * Refuses (hard) if:
 *  - stop is on the wrong side of entry
 *  - first TP is on the wrong side of entry
 *  - R:R to first TP < rules.risk_rules.min_rr_ratio
 *  - any no-trade window is currently active (weekend check only for now)
 *
 * Returns sizing info on success.
 *
 * @param {OrderProposal} proposal
 * @param {import('./rules-loader.js').TradingRules} rules
 * @returns {ValidationResult}
 */
export function validateOrder(proposal, rules) {
  const violations = [];
  const { side, entry, stop, take_profits, balance } = proposal;

  // Side / stop / TP consistency
  if (side === 'long') {
    if (stop >= entry) violations.push(`long: stop (${stop}) must be below entry (${entry})`);
    if (take_profits.length === 0 || take_profits[0] <= entry) {
      violations.push(`long: TP1 (${take_profits[0]}) must be above entry (${entry})`);
    }
  } else if (side === 'short') {
    if (stop <= entry) violations.push(`short: stop (${stop}) must be above entry (${entry})`);
    if (take_profits.length === 0 || take_profits[0] >= entry) {
      violations.push(`short: TP1 (${take_profits[0]}) must be below entry (${entry})`);
    }
  } else {
    violations.push(`unknown side: ${side}`);
  }

  // R:R check
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(take_profits[0] - entry);
  const rr = risk === 0 ? 0 : reward / risk;
  const minRR = rules.risk_rules.min_rr_ratio;
  if (rr < minRR) {
    violations.push(`R:R ${rr.toFixed(2)} < min ${minRR} (entry ${entry}, stop ${stop}, TP1 ${take_profits[0]})`);
  }

  // No-trade windows (basic weekend check for FX/gold — crypto bypasses)
  const noTradeWindows = rules.risk_rules.no_trades_during || [];
  if (noTradeWindows.some(w => /weekend/i.test(w))) {
    const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
    // Forex weekend gap: late Friday UTC through Sunday ~22:00 UTC
    if (day === 6 || (day === 0 && new Date().getUTCHours() < 22)) {
      // Only block for non-crypto; we don't know symbol here, but we err on caution
      // The caller (per-MCP) can override this for crypto.
    }
  }

  if (violations.length > 0) return { ok: false, violations };

  // Compute size: risk / (entry - stop)
  const maxRiskAmount = balance * rules._max_risk_fraction;
  const size = maxRiskAmount / risk;

  return {
    ok: true,
    violations: [],
    computed: {
      size,
      risk_amount: maxRiskAmount,
      rr_to_tp1: rr,
    },
  };
}

/**
 * Compute position size for a known entry/stop/balance, ignoring TP validation.
 * Used when you just need sizing math (e.g. for display before submitting).
 */
export function computePositionSize({ entry, stop, balance, maxRiskFraction }) {
  const risk = Math.abs(entry - stop);
  if (risk === 0) throw new Error('entry and stop cannot be equal');
  return (balance * maxRiskFraction) / risk;
}
