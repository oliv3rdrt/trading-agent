// bridge/tests/dashboard.test.js — boot the dashboard server, hit endpoints, verify shape.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/dashboard.js');
const PORT = 18091; // off the default so we don't collide with a running instance

// Seed a temp audit log
const tmpLog = path.join(os.tmpdir(), `dashboard-test-${Date.now()}.jsonl`);
const sampleOrder = {
  ts: new Date().toISOString(),
  ts_unix: Math.floor(Date.now() / 1000),
  broker: 'kraken',
  symbol: 'XBTUSDT',
  tv_symbol: 'BINANCE:BTCUSDT',
  side: 'long',
  order_type: 'bracket',
  entry: 81000, stop: 80000, take_profits: [83500, 85000],
  size: 0.1, risk_amount: 100, rr_to_tp1: 2.5,
  paper: true, reasoning: 'test', broker_order_id: 'PAPER-TEST',
};
fs.writeFileSync(tmpLog, JSON.stringify(sampleOrder) + '\n');

const serverProc = spawn('node', [SERVER], {
  env: { ...process.env, DASHBOARD_PORT: String(PORT), AUDIT_LOG_PATH: tmpLog, DASHBOARD_BALANCE: '10000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Wait for the server to log "→ http://localhost:..."
const ready = new Promise((resolve, reject) => {
  let buf = '';
  const onData = (data) => {
    buf += data.toString();
    if (buf.includes(`localhost:${PORT}`)) resolve();
  };
  serverProc.stdout.on('data', onData);
  serverProc.stderr.on('data', onData);
  serverProc.on('error', reject);
  setTimeout(() => reject(new Error('server start timeout: ' + buf)), 5000);
});

after(() => { try { serverProc.kill('SIGTERM'); fs.unlinkSync(tmpLog); } catch {} });

test('dashboard /health responds', async () => {
  await ready;
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
});

test('dashboard / serves HTML', async () => {
  await ready;
  const res = await fetch(`http://localhost:${PORT}/`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /<title>trading-agent<\/title>/);
  assert.match(text, /Daily risk budget/);
});

test('dashboard /api/data returns expected shape', async () => {
  await ready;
  const res = await fetch(`http://localhost:${PORT}/api/data`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.total, 1);
  assert.equal(d.paper, 1);
  assert.equal(d.live, 0);
  assert.equal(d.today_count, 1);
  assert.equal(d.today_risk_taken, 100);
  assert.ok(d.budget, 'budget should be present when rules.json has max_daily_risk');
  assert.equal(d.budget.taken, 100);
  assert.equal(d.budget.cap, 300);     // 3% of $10k
  assert.equal(d.budget.remaining, 200);
  assert.equal(d.by_broker.kraken.count, 1);
  assert.equal(d.by_symbol.XBTUSDT.count, 1);
  assert.equal(d.recent.length, 1);
  assert.equal(d.recent[0].broker_order_id, 'PAPER-TEST');
});

test('dashboard /api/recent?n=N respects limit', async () => {
  await ready;
  const res = await fetch(`http://localhost:${PORT}/api/recent?n=1`);
  assert.equal(res.status, 200);
  const arr = await res.json();
  assert.equal(arr.length, 1);
});
