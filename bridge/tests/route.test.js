// bridge/tests/route.test.js — exhaustive routing tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeSymbol, bracketToolName } from '../../shared/route.js';

test('crypto on Binance → kraken (XBT prefix)', () => {
  const d = routeSymbol('BINANCE:BTCUSDT');
  assert.equal(d.broker, 'kraken');
  assert.equal(d.broker_symbol, 'XBTUSDT');
});

test('crypto on Coinbase → kraken', () => {
  const d = routeSymbol('COINBASE:ETHUSDT');
  assert.equal(d.broker, 'kraken');
  assert.equal(d.broker_symbol, 'ETHUSDT');
});

test('forex/gold on IC Markets → forex', () => {
  const d = routeSymbol('ICMARKETS:XAUUSD');
  assert.equal(d.broker, 'forex');
  assert.equal(d.broker_symbol, 'XAUUSD');
});

test('forex on OANDA → forex', () => {
  const d = routeSymbol('OANDA:GBPUSD');
  assert.equal(d.broker, 'forex');
  assert.equal(d.broker_symbol, 'GBPUSD');
});

test('CRYPTOCAP macro → null (analysis-only)', () => {
  const d = routeSymbol('CRYPTOCAP:TOTAL');
  assert.equal(d.broker, null);
  assert.match(d.reason, /analysis-only/);
});

test('INDEX:SPX → null', () => {
  const d = routeSymbol('INDEX:SPX');
  assert.equal(d.broker, null);
});

test('empty/garbage → null with reason', () => {
  assert.equal(routeSymbol('').broker, null);
  assert.equal(routeSymbol(null).broker, null);
  assert.equal(routeSymbol(undefined).broker, null);
});

test('bracketToolName matches MCP-prefix conventions', () => {
  assert.equal(bracketToolName('kraken'), 'mcp__kraken__kraken_place_bracket_order');
  assert.equal(bracketToolName('forex'), 'mcp__forex__forex_place_bracket_order');
  assert.equal(bracketToolName(null), null);
});
