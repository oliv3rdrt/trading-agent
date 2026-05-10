// shared/rules-loader.js — loads rules.json and parses risk fields into numeric form.
//
// Throws on missing fields so misconfiguration fails loudly at startup, not at order time.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} TradingRules
 * @property {Object} watchlist
 * @property {string[]} timeframes_to_check
 * @property {Object} bias_criteria
 * @property {{ max_risk_per_trade: string, min_rr_ratio: number, no_trades_during: string[] }} risk_rules
 * @property {string[]} indicators_i_care_about
 * @property {number} _max_risk_fraction - parsed from max_risk_per_trade (e.g. "1%" → 0.01)
 */

/**
 * Load and validate rules.json. Returns the rules object with a parsed
 * `_max_risk_fraction` field added.
 *
 * @param {string} [rulesPath] - Path to rules.json. Defaults to RULES_PATH env or ../rules.json relative to caller.
 * @returns {TradingRules}
 */
export function loadRules(rulesPath) {
  const p = rulesPath || process.env.RULES_PATH || path.resolve(process.cwd(), 'rules.json');
  if (!fs.existsSync(p)) {
    throw new Error(`rules.json not found at ${p}. Set RULES_PATH env or pass explicit path.`);
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));

  // Required fields
  for (const key of ['watchlist', 'risk_rules']) {
    if (!raw[key]) throw new Error(`rules.json missing required field: ${key}`);
  }
  if (!raw.risk_rules.max_risk_per_trade) throw new Error('rules.json: risk_rules.max_risk_per_trade required');
  if (raw.risk_rules.min_rr_ratio == null) throw new Error('rules.json: risk_rules.min_rr_ratio required');

  raw._max_risk_fraction = parseRiskPercent(raw.risk_rules.max_risk_per_trade);
  return raw;
}

/**
 * Parse "1% of portfolio" or "1%" or "0.5%" into a fraction (0.01, 0.005, etc.).
 * @param {string} s
 * @returns {number}
 */
export function parseRiskPercent(s) {
  if (typeof s === 'number') return s;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) throw new Error(`Cannot parse risk percent from "${s}". Expected like "1%" or "1% of portfolio".`);
  const pct = parseFloat(m[1]);
  if (pct <= 0 || pct > 100) throw new Error(`Risk percent ${pct}% out of sane range (0,100].`);
  return pct / 100;
}
