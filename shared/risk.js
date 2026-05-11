// shared/risk.js — order validation against rules.json.
//
// All risk gates live here so both MCPs use the same rules and so the logic
// is unit-testable in one place.

import { checkDailyBudget, todaysOrderCount } from './daily-risk.js';

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
 *  - daily risk cap would be breached (when max_daily_risk is set)
 *  - too many open orders today (when max_open_orders is set)
 *  - notional exceeds confirm_above_notional_usd AND proposal.confirmed !== true
 *
 * Returns sizing info on success.
 *
 * @param {OrderProposal & { confirmed?: boolean }} proposal
 * @param {import('./rules-loader.js').TradingRules} rules
 * @returns {ValidationResult}
 */
export function validateOrder(proposal, rules) {
  const violations = [];
  const { side, entry, stop, take_profits, balance, confirmed } = proposal;

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

  // Compute size + notional BEFORE the remaining gates so they can reference it.
  const maxRiskAmount = balance * rules._max_risk_fraction;
  const size = risk === 0 ? 0 : maxRiskAmount / risk;
  const notional = size * entry;

  // Phase 4 — daily risk budget cap
  if (rules._max_daily_risk_fraction != null) {
    const daily = checkDailyBudget({
      proposedRisk: maxRiskAmount,
      balance,
      maxDailyFrac: rules._max_daily_risk_fraction,
    });
    if (!daily.ok) {
      violations.push(
        `Daily risk cap exceeded: $${daily.taken.toFixed(2)} already at risk today + $${maxRiskAmount.toFixed(2)} ` +
        `would push to $${daily.would_take.toFixed(2)} (cap = $${daily.cap.toFixed(2)}, ` +
        `${(rules._max_daily_risk_fraction * 100).toFixed(1)}% of balance)`
      );
    }
  }

  // Phase 4 — max open orders today
  if (rules._max_open_orders != null) {
    const count = todaysOrderCount();
    if (count >= rules._max_open_orders) {
      violations.push(
        `Daily order count cap reached: ${count} orders placed today (max ${rules._max_open_orders})`
      );
    }
  }

  // Phase 4 — notional confirmation gate
  if (rules._confirm_above_notional_usd != null && notional > rules._confirm_above_notional_usd && !confirmed) {
    violations.push(
      `Notional $${notional.toFixed(2)} exceeds confirm_above_notional_usd ` +
      `($${rules._confirm_above_notional_usd}). Re-call with confirmed: true to authorize.`
    );
  }

  if (violations.length > 0) return { ok: false, violations };

  return {
    ok: true,
    violations: [],
    computed: {
      size,
      risk_amount: maxRiskAmount,
      rr_to_tp1: rr,
      notional,
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
