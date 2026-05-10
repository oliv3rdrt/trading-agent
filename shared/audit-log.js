// shared/audit-log.js — append-only JSONL log of every order Claude composes.
//
// One line per order, machine-parseable (jq, grep). Captures the full context
// at the time of the order so the trade can be reconstructed later.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function defaultPath() {
  return process.env.AUDIT_LOG_PATH || path.join(os.homedir(), 'trading-agent', 'audit-log.jsonl');
}

/**
 * @typedef {Object} AuditEntry
 * @property {string} broker - "kraken" | "forex"
 * @property {string} symbol - broker-side symbol
 * @property {string} tv_symbol - original TradingView ticker (for traceability)
 * @property {"long" | "short"} side
 * @property {"limit" | "market" | "bracket"} order_type
 * @property {number} entry - entry price (or estimated for market)
 * @property {number} stop
 * @property {number[]} take_profits
 * @property {number} size - units in base currency
 * @property {number} risk_amount - dollars at risk
 * @property {number} rr_to_tp1 - R:R to first TP
 * @property {boolean} paper - true if PAPER_TRADING=1
 * @property {string} reasoning - free-text rationale (chart state, rules check)
 * @property {string} [broker_order_id] - filled after broker confirms
 */

/**
 * Append a single order to the audit log.
 * @param {Partial<AuditEntry>} entry
 * @param {string} [logPath]
 */
export function logOrder(entry, logPath) {
  const p = logPath || defaultPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ts_unix: Math.floor(Date.now() / 1000),
    ...entry,
  });
  fs.appendFileSync(p, line + '\n');
}

/**
 * Read recent audit log entries.
 * @param {number} [limit=20]
 * @param {string} [logPath]
 * @returns {AuditEntry[]}
 */
export function readRecent(limit = 20, logPath) {
  const p = logPath || defaultPath();
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  return lines.slice(-limit).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
