// shared/daily-risk.js — reads audit-log.jsonl and tallies today's risk budget.
//
// Why "risk", not "loss":
//   In paper mode every order shows as "filled" but doesn't actually resolve
//   into a realized P&L (no simulated stop/TP hits). Tracking *realized loss*
//   requires either real-broker reconciliation or a paper-mode tick simulator —
//   both out of scope for Phase 4.
//
//   "Cumulative risk taken today" is the more meaningful constraint for
//   discretionary traders anyway: it caps how many bullets you can fire in a
//   day before mandatory stop. If you've put $300 at risk across three trades
//   and your daily cap is 3% of a $10K account ($300), no more new orders
//   until tomorrow — regardless of whether those trades are winning or losing.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function defaultLogPath() {
  return process.env.AUDIT_LOG_PATH || path.join(os.homedir(), 'trading-agent', 'audit-log.jsonl');
}

/**
 * Read all order entries from the audit log on a given UTC date.
 *
 * @param {Date} [date] - defaults to now
 * @param {string} [logPath]
 * @returns {Array<Object>} - audit entries placed on that UTC day
 */
export function ordersOnDate(date = new Date(), logPath) {
  const p = logPath || defaultLogPath();
  if (!fs.existsSync(p)) return [];
  const isoDay = date.toISOString().slice(0, 10); // "2026-05-11"
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  return lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(e => e && typeof e.ts === 'string' && e.ts.startsWith(isoDay))
    // Cancels are zero-risk events; exclude them from risk tally
    .filter(e => e.order_type !== 'cancel');
}

/**
 * Sum risk_amount across today's orders.
 * Returns 0 if no orders or all entries lack risk_amount.
 */
export function todaysRiskTaken(logPath) {
  return ordersOnDate(new Date(), logPath)
    .reduce((sum, e) => sum + (typeof e.risk_amount === 'number' ? e.risk_amount : 0), 0);
}

/**
 * Count of open (non-cancelled) bracket/limit/market orders today.
 * Approximate — doesn't reconcile with broker fills/closes.
 */
export function todaysOrderCount(logPath) {
  return ordersOnDate(new Date(), logPath).length;
}

/**
 * Given a new proposed order, would it breach the daily risk cap?
 *
 * @param {Object} args
 * @param {number} args.proposedRisk - $ risk of the new order
 * @param {number} args.balance      - account balance
 * @param {number} args.maxDailyFrac - max_daily_risk as a fraction (e.g. 0.03)
 * @param {string} [args.logPath]
 * @returns {{ ok: boolean, taken: number, would_take: number, cap: number, fraction_after: number }}
 */
export function checkDailyBudget({ proposedRisk, balance, maxDailyFrac, logPath }) {
  const taken = todaysRiskTaken(logPath);
  const wouldTake = taken + proposedRisk;
  const cap = balance * maxDailyFrac;
  return {
    ok: wouldTake <= cap,
    taken,
    would_take: wouldTake,
    cap,
    fraction_after: balance > 0 ? wouldTake / balance : Infinity,
  };
}
