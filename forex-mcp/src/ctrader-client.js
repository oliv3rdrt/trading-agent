// forex-mcp/src/ctrader-client.js — thin wrapper around the ctrader-ts library.
//
// Manages a single connection per MCP-server lifetime: connects on first read,
// reuses for subsequent calls. Read-only methods exposed here are called by
// the MCP read tools.
//
// Auth comes from .env (CTRADER_*). The lib's `connect()` accepts explicit
// config so we don't need to use its built-in config storage.

import { connect, DEMO_ENDPOINT, LIVE_ENDPOINT } from 'ctrader-ts';

let _ct = null;

/**
 * Get a connected CTrader instance. Reuses one connection across calls.
 * Throws if required env vars are missing — caller should surface the message
 * verbatim so the user knows to run `npm run auth`.
 */
export async function getCTrader() {
  if (_ct) return _ct;

  const required = ['CTRADER_CLIENT_ID', 'CTRADER_CLIENT_SECRET', 'CTRADER_ACCESS_TOKEN', 'CTRADER_ACCOUNT_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `cTrader not configured. Missing env vars: ${missing.join(', ')}.\n` +
      `Run \`cd forex-mcp && npm run auth\` to complete OAuth setup.`
    );
  }

  const isLive = process.env.CTRADER_IS_LIVE === '1';

  _ct = await connect({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: Number(process.env.CTRADER_ACCOUNT_ID),
    endpoint: isLive ? LIVE_ENDPOINT : DEMO_ENDPOINT,
  });

  return _ct;
}

/**
 * Close the connection on shutdown. Idempotent.
 */
export async function closeCTrader() {
  if (_ct) {
    try { await _ct.disconnect?.(); } catch { /* ignore */ }
    _ct = null;
  }
}
