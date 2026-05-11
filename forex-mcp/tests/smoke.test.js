// forex-mcp/tests/smoke.test.js — verify modules import, symbol mapping,
// paper-broker bracket placement for forex. No real cTrader calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { loadRules } from '../../shared/rules-loader.js';
import { validateOrder } from '../../shared/risk.js';
import { mapToCTrader, mapToKraken } from '../../shared/symbol-map.js';
import { paperPlaceBracket } from '../../shared/paper-broker.js';

const tmpLog = path.join(os.tmpdir(), `forex-mcp-test-${Date.now()}.jsonl`);
process.env.AUDIT_LOG_PATH = tmpLog;

test('symbol-map: ICMARKETS:XAUUSD → XAUUSD (cTrader)', () => {
  assert.equal(mapToCTrader('ICMARKETS:XAUUSD'), 'XAUUSD');
});

test('symbol-map: OANDA:EURUSD → EURUSD (cTrader)', () => {
  assert.equal(mapToCTrader('OANDA:EURUSD'), 'EURUSD');
});

test('symbol-map: crypto tickers route to null for cTrader', () => {
  assert.equal(mapToCTrader('BINANCE:BTCUSDT'), null);
  assert.equal(mapToCTrader('CRYPTOCAP:TOTAL'), null);
});

test('symbol-map: forex tickers route to null for Kraken', () => {
  assert.equal(mapToKraken('ICMARKETS:XAUUSD'), null);
});

test('risk: forex bracket order with valid R:R (XAUUSD) — small notional', () => {
  const rules = loadRules(path.resolve('../rules.json'));
  // $1000 balance keeps notional under $5k confirm threshold.
  const result = validateOrder({
    side: 'long',
    entry: 4700,    // XAUUSD-style price
    stop: 4675,
    take_profits: [4764, 4857],   // R:R 2.56 to TP1
    balance: 1_000,
  }, rules);
  assert.ok(result.ok, `Expected ok, got: ${(result.violations || []).join(', ')}`);
  assert.ok(result.computed.rr_to_tp1 >= 2);
});

test('paper-broker: forex bracket logs to audit', () => {
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
  const result = paperPlaceBracket({
    broker: 'forex',
    symbol: 'XAUUSD',
    tv_symbol: 'ICMARKETS:XAUUSD',
    side: 'long',
    entry: 4700,
    stop: 4675,
    take_profits: [4764, 4857, 4889],
    size: 0.4,
    risk_amount: 100,
    rr_to_tp1: 2.56,
    reasoning: 'smoke test',
  });
  assert.ok(result.success && result.paper);
  const entry = JSON.parse(fs.readFileSync(tmpLog, 'utf8').trim());
  assert.equal(entry.broker, 'forex');
  assert.equal(entry.symbol, 'XAUUSD');
  fs.unlinkSync(tmpLog);
});
