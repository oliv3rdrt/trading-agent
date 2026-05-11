// kraken-mcp/tests/smoke.test.js
// Verifies the modules import, risk gates reject bad trades, paper-broker
// returns synthetic fills, and the audit log gets written. Does NOT hit Kraken.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { loadRules } from '../../shared/rules-loader.js';
import { validateOrder } from '../../shared/risk.js';
import { mapToKraken } from '../../shared/symbol-map.js';
import { paperPlaceBracket } from '../../shared/paper-broker.js';

// Direct the audit log to a temp file so we don't pollute the real one
const tmpLog = path.join(os.tmpdir(), `kraken-mcp-test-${Date.now()}.jsonl`);
process.env.AUDIT_LOG_PATH = tmpLog;

test('symbol-map: BINANCE:BTCUSDT → XBTUSDT', () => {
  assert.equal(mapToKraken('BINANCE:BTCUSDT'), 'XBTUSDT');
});

test('symbol-map: forex/macro tickers return null', () => {
  assert.equal(mapToKraken('ICMARKETS:XAUUSD'), null);
  assert.equal(mapToKraken('CRYPTOCAP:TOTAL'), null);
});

test('rules-loader: loads and parses risk %', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  assert.ok(rules.risk_rules);
  assert.equal(rules._max_risk_fraction, 0.01, '1% should parse to 0.01');
  assert.equal(rules.risk_rules.min_rr_ratio, 2);
});

test('risk.validateOrder: accepts a clean R:R 2.5 long (small notional)', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  // Use balance that keeps notional under confirm_above_notional_usd (5000)
  // so the order passes without confirmed flag.
  const result = validateOrder({
    side: 'long',
    entry: 81000, stop: 80000, take_profits: [83500],  // 2500/1000 = 2.5
    balance: 6_000,
  }, rules);
  assert.ok(result.ok, `Expected ok, got violations: ${(result.violations || []).join(', ')}`);
  assert.ok(result.computed.rr_to_tp1 >= 2);
  assert.ok(result.computed.size > 0);
});

test('risk.validateOrder: accepts oversized notional with confirmed flag', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  const result = validateOrder({
    side: 'long',
    entry: 81000, stop: 80000, take_profits: [83500],
    balance: 100_000,
    confirmed: true,
  }, rules);
  assert.ok(result.ok, `Expected ok with confirmed=true, got: ${(result.violations || []).join(', ')}`);
});

test('risk.validateOrder: rejects R:R below min', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  const result = validateOrder({
    side: 'long',
    entry: 81000, stop: 80000, take_profits: [81500],  // 500/1000 = 0.5
    balance: 10_000,
  }, rules);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => /R:R/.test(v)));
});

test('risk.validateOrder: rejects long with stop above entry', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  const result = validateOrder({
    side: 'long',
    entry: 81000, stop: 82000, take_profits: [85000],
    balance: 10_000,
  }, rules);
  assert.equal(result.ok, false);
});

test('paper-broker: places a bracket and writes audit entry', () => {
  // ensure clean log
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);

  const result = paperPlaceBracket({
    broker: 'kraken',
    symbol: 'XBTUSDT',
    tv_symbol: 'BINANCE:BTCUSDT',
    side: 'long',
    entry: 81000,
    stop: 80000,
    take_profits: [83500, 85000, 87500],
    size: 0.1,
    risk_amount: 100,
    rr_to_tp1: 2.5,
    reasoning: 'smoke test',
  });
  assert.ok(result.success);
  assert.ok(result.paper);
  assert.match(result.order_id, /^PAPER-/);

  const log = fs.readFileSync(tmpLog, 'utf8').trim();
  const entry = JSON.parse(log);
  assert.equal(entry.broker, 'kraken');
  assert.equal(entry.symbol, 'XBTUSDT');
  assert.equal(entry.side, 'long');
  assert.equal(entry.broker_order_id, result.order_id);
  fs.unlinkSync(tmpLog);
});
