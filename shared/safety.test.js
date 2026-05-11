// shared/safety.test.js — Phase 4 safety-rail tests.
// Covers daily risk cap, max-open-orders, notional confirmation gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadRules } from './rules-loader.js';
import { validateOrder } from './risk.js';
import { todaysRiskTaken, checkDailyBudget, ordersOnDate } from './daily-risk.js';
import { logOrder } from './audit-log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.resolve(__dirname, '../rules.json');

// Use a fresh temp log per test file so we don't read pollution from real audit-log.
const tmpLog = path.join(os.tmpdir(), `safety-test-${Date.now()}.jsonl`);
process.env.AUDIT_LOG_PATH = tmpLog;

function freshLog() {
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
}

function logFakeOrder(risk) {
  logOrder({
    broker: 'kraken', symbol: 'XBTUSDT', tv_symbol: 'BINANCE:BTCUSDT',
    side: 'long', order_type: 'bracket',
    entry: 81000, stop: 80000, take_profits: [83500],
    size: risk / 1000, risk_amount: risk, rr_to_tp1: 2.5,
    paper: true, reasoning: 'test', broker_order_id: 'TEST',
  });
}

test('rules-loader: parses Phase 4 fields', () => {
  const rules = loadRules(RULES_PATH);
  assert.equal(rules._max_daily_risk_fraction, 0.03, '3% should parse to 0.03');
  assert.equal(rules._confirm_above_notional_usd, 5000);
  assert.equal(rules._max_open_orders, 5);
});

test('daily-risk: empty log returns 0', () => {
  freshLog();
  assert.equal(todaysRiskTaken(tmpLog), 0);
  assert.equal(ordersOnDate(new Date(), tmpLog).length, 0);
});

test('daily-risk: sums today\'s risk_amounts', () => {
  freshLog();
  logFakeOrder(50);
  logFakeOrder(75);
  logFakeOrder(100);
  assert.equal(todaysRiskTaken(tmpLog), 225);
});

test('daily-risk: checkDailyBudget at-cap is ok, over-cap is not', () => {
  freshLog();
  logFakeOrder(200);
  const balance = 10_000;
  const atCap = checkDailyBudget({ proposedRisk: 100, balance, maxDailyFrac: 0.03, logPath: tmpLog });
  assert.equal(atCap.taken, 200);
  assert.equal(atCap.would_take, 300);
  assert.equal(atCap.cap, 300);
  assert.equal(atCap.ok, true);

  const overCap = checkDailyBudget({ proposedRisk: 101, balance, maxDailyFrac: 0.03, logPath: tmpLog });
  assert.equal(overCap.ok, false);
});

test('risk.validateOrder: refuses when daily cap would be breached', () => {
  freshLog();
  // Already at $250 risk today
  logFakeOrder(250);
  const rules = loadRules(RULES_PATH);
  // Proposed: 1% of $10k = $100. Total would be $350, cap is $300 → refuse.
  const result = validateOrder({
    side: 'long', entry: 81000, stop: 80000, take_profits: [83500],
    balance: 10_000,
  }, rules);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => /Daily risk cap/.test(v)));
});

test('risk.validateOrder: refuses oversized notional without confirmed flag', () => {
  freshLog();
  const rules = loadRules(RULES_PATH);
  // Entry 81000, stop 80000 → risk 1000 per unit. Balance 1M → 1% = $10k risk.
  // Size = 10000 / 1000 = 10 units. Notional = 81000 * 10 = $810,000 → way above $5k cap.
  const result = validateOrder({
    side: 'long', entry: 81000, stop: 80000, take_profits: [83500],
    balance: 1_000_000,
  }, rules);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => /Notional/.test(v)), `Expected Notional violation, got: ${result.violations.join(', ')}`);
});

test('risk.validateOrder: passes oversized notional with confirmed: true', () => {
  freshLog();
  const rules = loadRules(RULES_PATH);
  const result = validateOrder({
    side: 'long', entry: 81000, stop: 80000, take_profits: [83500],
    balance: 1_000_000,
    confirmed: true,
  }, rules);
  assert.equal(result.ok, true, `Expected ok with confirmed=true, got violations: ${(result.violations || []).join(', ')}`);
  assert.ok(result.computed.notional > 5000);
});

test('risk.validateOrder: passes when within all caps', () => {
  freshLog();
  const rules = loadRules(RULES_PATH);
  // Small balance → small notional → no confirmation needed
  const result = validateOrder({
    side: 'long', entry: 81000, stop: 80000, take_profits: [83500],
    balance: 10_000,   // $100 risk, size 0.1, notional $8100 — that's still > $5k cap.
  }, rules);
  // Notional 8100 > 5000 → still requires confirmed. So expect refusal here.
  assert.equal(result.ok, false);

  // Smaller balance to keep notional under $5k
  const small = validateOrder({
    side: 'long', entry: 81000, stop: 80000, take_profits: [83500],
    balance: 6_000,    // $60 risk, size 0.06, notional $4860 — under $5k cap
  }, rules);
  assert.equal(small.ok, true, `Expected ok, got: ${(small.violations || []).join(', ')}`);
});
