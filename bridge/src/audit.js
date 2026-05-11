#!/usr/bin/env node
// bridge/src/audit.js — read-only CLI over audit-log.jsonl.
//
// Examples:
//   node bridge/src/audit.js summary             # totals across all entries
//   node bridge/src/audit.js today               # orders + risk used today
//   node bridge/src/audit.js tail 10             # last 10 entries
//   node bridge/src/audit.js budget              # daily risk budget vs cap
//   node bridge/src/audit.js by-broker           # split by broker
//   node bridge/src/audit.js by-symbol           # split by symbol

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadRules } from '../../shared/rules-loader.js';
import { todaysRiskTaken, todaysOrderCount, checkDailyBudget, ordersOnDate } from '../../shared/daily-risk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.resolve(__dirname, '../../rules.json');
const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(os.homedir(), 'trading-agent', 'audit-log.jsonl');

function readAll() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function fmtUSD(n) { return '$' + Number(n).toFixed(2); }
function fmtPct(n) { return (Number(n) * 100).toFixed(2) + '%'; }

const cmd = process.argv[2];
const arg = process.argv[3];
const entries = readAll();

if (!cmd || cmd === '-h' || cmd === '--help') {
  console.log(`Usage: node bridge/src/audit.js <command> [arg]

Commands:
  summary        Total orders, paper vs live, by broker
  today          Orders placed today + cumulative risk
  tail [N=10]    Last N entries (pretty-printed)
  budget         Compare today's risk vs rules.json daily cap
  by-broker      Order count + risk by broker
  by-symbol      Order count + risk by symbol

Audit log: ${LOG_PATH}
Total entries: ${entries.length}
`);
  process.exit(0);
}

if (cmd === 'summary') {
  const byBroker = {};
  let paper = 0, live = 0, cancels = 0;
  for (const e of entries) {
    if (e.order_type === 'cancel') { cancels++; continue; }
    if (e.paper) paper++; else live++;
    const b = e.broker || 'unknown';
    byBroker[b] = (byBroker[b] || 0) + 1;
  }
  console.log(`Total non-cancel orders: ${entries.length - cancels}`);
  console.log(`  paper: ${paper}`);
  console.log(`  live:  ${live}`);
  console.log(`  cancels (logged): ${cancels}`);
  console.log(`By broker:`);
  for (const [b, n] of Object.entries(byBroker)) console.log(`  ${b.padEnd(10)} ${n}`);
}

else if (cmd === 'today') {
  const today = ordersOnDate(new Date(), LOG_PATH);
  const taken = todaysRiskTaken(LOG_PATH);
  console.log(`Today (UTC ${new Date().toISOString().slice(0, 10)}):`);
  console.log(`  orders placed: ${today.length}`);
  console.log(`  cumulative risk: ${fmtUSD(taken)}`);
  if (today.length > 0) {
    console.log('  recent:');
    today.slice(-5).forEach(e => {
      console.log(`    ${e.ts}  ${e.broker.padEnd(7)} ${e.side?.padEnd(5) || ''} ${e.symbol?.padEnd(10) || ''} risk=${fmtUSD(e.risk_amount || 0)}  R:R=${(e.rr_to_tp1 || 0).toFixed(2)}`);
    });
  }
}

else if (cmd === 'tail') {
  const n = parseInt(arg, 10) || 10;
  entries.slice(-n).forEach(e => {
    console.log(`${e.ts}  ${e.broker?.padEnd(7) || '?'} ${(e.order_type || '?').padEnd(8)} ${e.side?.padEnd(5) || ''} ${e.symbol?.padEnd(12) || ''} entry=${e.entry ?? '-'} stop=${e.stop ?? '-'} TPs=${(e.take_profits || []).join(',')} size=${e.size ?? '-'}`);
  });
}

else if (cmd === 'budget') {
  try {
    const rules = loadRules(RULES_PATH);
    if (rules._max_daily_risk_fraction == null) {
      console.log('No max_daily_risk set in rules.json — daily budget cap disabled.');
      process.exit(0);
    }
    // Approximate balance — paper mode default
    const balance = parseFloat(process.env.AUDIT_ASSUMED_BALANCE || '10000');
    const status = checkDailyBudget({
      proposedRisk: 0, balance, maxDailyFrac: rules._max_daily_risk_fraction, logPath: LOG_PATH,
    });
    console.log(`Daily risk budget (assumed balance ${fmtUSD(balance)}):`);
    console.log(`  cap:        ${fmtUSD(status.cap)} (${fmtPct(rules._max_daily_risk_fraction)} of balance)`);
    console.log(`  taken:      ${fmtUSD(status.taken)}`);
    console.log(`  remaining:  ${fmtUSD(status.cap - status.taken)}`);
    console.log(`  utilization: ${fmtPct(status.cap === 0 ? 0 : status.taken / status.cap)}`);
    if (rules._max_open_orders != null) {
      const count = todaysOrderCount(LOG_PATH);
      console.log(`  orders today: ${count} / ${rules._max_open_orders}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

else if (cmd === 'by-broker' || cmd === 'by-symbol') {
  const key = cmd === 'by-broker' ? 'broker' : 'symbol';
  const groups = {};
  for (const e of entries) {
    if (e.order_type === 'cancel') continue;
    const k = e[key] || 'unknown';
    if (!groups[k]) groups[k] = { count: 0, risk: 0 };
    groups[k].count++;
    groups[k].risk += e.risk_amount || 0;
  }
  console.log(`By ${key}:`);
  const sorted = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
  for (const [k, v] of sorted) console.log(`  ${k.padEnd(15)} ${String(v.count).padStart(4)} orders  ${fmtUSD(v.risk).padStart(10)} total risk`);
}

else {
  console.error(`Unknown command: ${cmd}`);
  console.error('Run with -h for help.');
  process.exit(1);
}
