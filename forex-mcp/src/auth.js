#!/usr/bin/env node
// forex-mcp/src/auth.js — one-time OAuth2 setup for cTrader Open API.
//
// Run this once to link your cTrader account to the app.
// Flow:
//   1. Reads CTRADER_CLIENT_ID + CTRADER_CLIENT_SECRET from .env
//   2. Spins up a local HTTP server on :8080 to catch the OAuth redirect
//   3. Opens your browser to the cTrader authorization page
//   4. After you grant access, captures the auth code from the redirect
//   5. Exchanges the code for an access token + refresh token
//   6. Lists your trading accounts; if multiple, prompts you to pick one
//   7. Writes CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN, CTRADER_ACCOUNT_ID
//      back into .env (gitignored)
//
// Usage:
//   cd forex-mcp
//   npm run auth

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../.env');

// Load .env from repo root
dotenv.config({ path: ENV_PATH });

const CLIENT_ID = process.env.CTRADER_CLIENT_ID;
const CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/callback';
const PORT = 8080;

const AUTH_URL = 'https://openapi.ctrader.com/apps/auth';
const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';
const ACCOUNTS_URL = 'https://api.spotware.com/connect/tradingaccounts';

function die(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.error('Could not open browser automatically. Open this URL manually:\n', url); });
}

async function getAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.statusCode = 404; res.end('Not found'); return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err) {
        res.statusCode = 400;
        res.end(`<html><body><h2>❌ cTrader returned error: ${err}</h2><p>Check terminal for details.</p></body></html>`);
        server.close();
        reject(new Error(`OAuth error: ${err} — ${url.searchParams.get('error_description') || 'no description'}`));
        return;
      }
      if (!code) {
        res.statusCode = 400; res.end('Missing code'); return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body style="font-family:system-ui;padding:2em"><h2>✅ Got it — you can close this tab</h2><p>Switch back to your terminal.</p></body></html>');
      server.close();
      resolve(code);
    });
    server.listen(PORT, () => {
      console.log(`\nListening on http://localhost:${PORT}/callback ...`);
    });
    server.on('error', reject);
  });
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok || json.errorCode) {
    die(`Token exchange failed: ${json.errorCode || res.status} — ${json.description || JSON.stringify(json)}`);
  }
  return json; // { accessToken, refreshToken, expiresIn, tokenType }
}

async function listAccounts(accessToken) {
  const res = await fetch(`${ACCOUNTS_URL}?access_token=${accessToken}`);
  const json = await res.json();
  if (!res.ok || json.errorCode) {
    die(`Failed to list accounts: ${json.errorCode || res.status} — ${json.description || JSON.stringify(json)}`);
  }
  return json.data || json; // array of { accountId, accountNumber, brokerName, isLive, ... }
}

async function pickAccount(accounts) {
  if (accounts.length === 0) die('No trading accounts found on this cTrader profile. Open cTrader, ensure you have a Demo or Live account, and re-run.');
  if (accounts.length === 1) {
    const a = accounts[0];
    console.log(`\nOnly one account found, auto-selecting:`);
    console.log(`  #${a.accountNumber} (${a.brokerName}) — ${a.isLive ? 'LIVE' : 'DEMO'}`);
    return a;
  }
  console.log('\nMultiple accounts found:');
  accounts.forEach((a, i) => {
    console.log(`  [${i}] #${a.accountNumber}  ${a.brokerName.padEnd(20)}  ${a.isLive ? '🔴 LIVE' : '🟢 DEMO'}  ${a.depositCurrency || ''}`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pick = await rl.question('\nPick index (recommend DEMO for paper-trading verification): ');
  rl.close();
  const idx = parseInt(pick, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= accounts.length) die(`Invalid pick: ${pick}`);
  return accounts[idx];
}

function upsertEnvLines(updates) {
  // Read .env, replace lines matching KEY=... or # KEY=... with the new value.
  // If the key doesn't exist, append it.
  let content = fs.readFileSync(ENV_PATH, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
    }
  }
  fs.writeFileSync(ENV_PATH, content);
}

// ============================================================================
async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    die(`CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET must be set in ${ENV_PATH}`);
  }

  const authUrl = `${AUTH_URL}?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=trading&response_type=code`;

  console.log('===========================================================');
  console.log(' cTrader Open API — one-time auth setup');
  console.log('===========================================================');
  console.log('\nOpening your browser. If it doesn\'t open, visit this URL:');
  console.log(`\n  ${authUrl}\n`);
  console.log('After you grant access, the browser will redirect to localhost:8080.');

  openBrowser(authUrl);
  const code = await getAuthCode();
  console.log('\n✓ Got authorization code, exchanging for token...');

  const tokenResp = await exchangeCodeForToken(code);
  console.log(`✓ Got access token (expires in ${tokenResp.expiresIn}s)`);

  const accounts = await listAccounts(tokenResp.accessToken);
  const account = await pickAccount(accounts);

  upsertEnvLines({
    CTRADER_ACCESS_TOKEN: tokenResp.accessToken,
    CTRADER_REFRESH_TOKEN: tokenResp.refreshToken,
    CTRADER_ACCOUNT_ID: account.accountId,
    CTRADER_ACCOUNT_NUMBER: account.accountNumber,
    CTRADER_IS_LIVE: account.isLive ? '1' : '0',
    CTRADER_BROKER: account.brokerName,
  });

  console.log('\n===========================================================');
  console.log(`✅ Done. .env updated with cTrader credentials.`);
  console.log(`   Account: #${account.accountNumber} (${account.brokerName}) — ${account.isLive ? 'LIVE' : 'DEMO'}`);
  console.log('   Access token rotates every ' + tokenResp.expiresIn + 's; refresh logic is in the MCP server.');
  console.log('===========================================================\n');
}

main().catch(err => die(err.message || String(err)));
