#!/usr/bin/env node
// bridge/src/dashboard.js — local web dashboard for the trading-agent.
//
// Single Node HTTP server (no deps) that serves:
//   GET /               → dashboard.html
//   GET /api/data       → JSON: budget, today, recent, by-broker, by-symbol
//   GET /api/recent?n=N → last N orders
//
// Run:
//   cd bridge && npm run dashboard
// Opens at http://localhost:8090 (override with DASHBOARD_PORT=8090).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadRules } from '../../shared/rules-loader.js';
import { todaysRiskTaken, todaysOrderCount, checkDailyBudget, ordersOnDate } from '../../shared/daily-risk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.resolve(__dirname, '../../rules.json');
const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(os.homedir(), 'trading-agent', 'audit-log.jsonl');
const PORT = parseInt(process.env.DASHBOARD_PORT || '8090', 10);
const ASSUMED_BALANCE = parseFloat(process.env.DASHBOARD_BALANCE || '10000');

const HTML_PATH = path.resolve(__dirname, 'dashboard.html');

function readEntries() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function computeData() {
  const entries = readEntries();
  const nonCancel = entries.filter(e => e.order_type !== 'cancel');

  // Counters
  let paper = 0, live = 0;
  const byBroker = {};
  const bySymbol = {};
  for (const e of nonCancel) {
    if (e.paper) paper++; else live++;
    const b = e.broker || 'unknown';
    if (!byBroker[b]) byBroker[b] = { count: 0, risk: 0 };
    byBroker[b].count++;
    byBroker[b].risk += e.risk_amount || 0;
    const s = e.symbol || 'unknown';
    if (!bySymbol[s]) bySymbol[s] = { count: 0, risk: 0 };
    bySymbol[s].count++;
    bySymbol[s].risk += e.risk_amount || 0;
  }

  // Today
  const today = ordersOnDate(new Date(), LOG_PATH);
  const taken = todaysRiskTaken(LOG_PATH);

  // Budget — only if rules.json has the cap configured
  let budget = null;
  let max_open_orders = null;
  try {
    const rules = loadRules(RULES_PATH);
    if (rules._max_daily_risk_fraction != null) {
      const status = checkDailyBudget({
        proposedRisk: 0,
        balance: ASSUMED_BALANCE,
        maxDailyFrac: rules._max_daily_risk_fraction,
        logPath: LOG_PATH,
      });
      budget = {
        cap: status.cap,
        taken: status.taken,
        remaining: status.cap - status.taken,
        utilization: status.cap === 0 ? 0 : status.taken / status.cap,
        balance: ASSUMED_BALANCE,
        cap_fraction: rules._max_daily_risk_fraction,
      };
    }
    if (rules._max_open_orders != null) max_open_orders = rules._max_open_orders;
  } catch { /* rules.json missing — leave budget null */ }

  return {
    server_ts: new Date().toISOString(),
    log_path: LOG_PATH,
    total: nonCancel.length,
    paper, live,
    today_count: today.length,
    today_risk_taken: taken,
    budget,
    max_open_orders,
    by_broker: byBroker,
    by_symbol: bySymbol,
    recent: nonCancel.slice(-20).reverse(),  // newest first
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS so the HTML can fetch from itself even if served by file://
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    if (!fs.existsSync(HTML_PATH)) {
      res.statusCode = 500;
      res.end('dashboard.html missing — expected at ' + HTML_PATH);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(HTML_PATH));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/data') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(computeData(), null, 2));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/recent') {
    const n = parseInt(url.searchParams.get('n') || '10', 10);
    const entries = readEntries().filter(e => e.order_type !== 'cancel');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(entries.slice(-n).reverse()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  trading-agent dashboard\n`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  audit log: ${LOG_PATH}`);
  console.log(`  assumed balance: $${ASSUMED_BALANCE.toFixed(2)} (set DASHBOARD_BALANCE to override)`);
  console.log(`\n  Ctrl+C to stop.\n`);
});
