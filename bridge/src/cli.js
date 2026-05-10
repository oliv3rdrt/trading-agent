#!/usr/bin/env node
// bridge/src/cli.js — diagnostic CLI for the routing layer.
//
// Usage:
//   node bridge/src/cli.js route BINANCE:BTCUSDT
//   node bridge/src/cli.js route ICMARKETS:XAUUSD
//   node bridge/src/cli.js route CRYPTOCAP:TOTAL
//
// Outputs a JSON decision: which broker MCP should execute, and the
// translated broker-side symbol.

import { routeSymbol, bracketToolName } from '../../shared/route.js';

const cmd = process.argv[2];
const arg = process.argv[3];

if (!cmd) {
  console.log('Usage: node bridge/src/cli.js <command> [args]');
  console.log('');
  console.log('Commands:');
  console.log('  route <TV_TICKER>   Show the routing decision for a TradingView ticker.');
  process.exit(0);
}

if (cmd === 'route') {
  if (!arg) {
    console.error('Usage: node bridge/src/cli.js route <TV_TICKER>');
    process.exit(1);
  }
  const decision = routeSymbol(arg);
  decision.bracket_tool = bracketToolName(decision.broker);
  console.log(JSON.stringify(decision, null, 2));
  process.exit(decision.broker ? 0 : 2);
}

console.error(`Unknown command: ${cmd}`);
process.exit(1);
