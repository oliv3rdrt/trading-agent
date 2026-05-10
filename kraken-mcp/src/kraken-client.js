// kraken-mcp/src/kraken-client.js — minimal Kraken REST client.
//
// Public endpoints (Time, AssetPairs, Ticker, Depth) need no auth.
// Private endpoints (Balance, OpenOrders, AddOrder) use HMAC-SHA512.
//
// We use built-in fetch (Node 18+) and crypto. No external HTTP lib.

import crypto from 'node:crypto';

const BASE_URL = 'https://api.kraken.com';

export class KrakenClient {
  /**
   * @param {Object} opts
   * @param {string} [opts.apiKey]    - required for private endpoints
   * @param {string} [opts.apiSecret] - base64-encoded secret from Kraken
   */
  constructor({ apiKey, apiSecret } = {}) {
    this.apiKey = apiKey || process.env.KRAKEN_API_KEY;
    this.apiSecret = apiSecret || process.env.KRAKEN_API_SECRET;
  }

  /**
   * Call a public endpoint. No auth required.
   * @param {string} endpoint - e.g. "Ticker"
   * @param {Object} [params]
   */
  async public(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}/0/public/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { method: 'GET' });
    const json = await res.json();
    if (json.error && json.error.length > 0) {
      throw new Error(`Kraken public/${endpoint} error: ${json.error.join('; ')}`);
    }
    return json.result;
  }

  /**
   * Call a private endpoint. Requires apiKey + apiSecret.
   * @param {string} endpoint - e.g. "Balance"
   * @param {Object} [params]
   */
  async private(endpoint, params = {}) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Kraken private endpoints require KRAKEN_API_KEY and KRAKEN_API_SECRET (set in .env)');
    }
    const path = `/0/private/${endpoint}`;
    const nonce = Date.now().toString();
    const body = new URLSearchParams({ nonce, ...stringifyParams(params) });
    const bodyStr = body.toString();

    const signature = this._sign(path, nonce, bodyStr);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': this.apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyStr,
    });
    const json = await res.json();
    if (json.error && json.error.length > 0) {
      throw new Error(`Kraken private/${endpoint} error: ${json.error.join('; ')}`);
    }
    return json.result;
  }

  _sign(path, nonce, postData) {
    const secret = Buffer.from(this.apiSecret, 'base64');
    const sha256 = crypto.createHash('sha256').update(nonce + postData).digest();
    const hmac = crypto.createHmac('sha512', secret);
    hmac.update(path);
    hmac.update(sha256);
    return hmac.digest('base64');
  }
}

/** Stringify object values for URLSearchParams (handles arrays as JSON). */
function stringifyParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}
