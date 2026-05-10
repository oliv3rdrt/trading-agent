// shared/paper-broker.js — stub broker used when PAPER_TRADING=1.
//
// Records the order to the audit log and returns a synthetic fill confirmation
// without touching any real broker API. Both MCPs delegate to this when paper
// mode is on so the trade-execution code path stays identical.

import { logOrder } from './audit-log.js';

let _paperOrderCounter = Date.now() % 1_000_000;

function nextPaperId(prefix) {
  _paperOrderCounter += 1;
  return `${prefix}-${_paperOrderCounter.toString(36).toUpperCase()}`;
}

/**
 * Pretend to place a bracket order. Logs to audit and returns a fake fill.
 *
 * @param {Object} params
 * @param {string} params.broker         - "kraken" | "forex"
 * @param {string} params.symbol         - broker-side symbol
 * @param {string} [params.tv_symbol]    - original TV ticker, for traceability
 * @param {"long" | "short"} params.side
 * @param {number} params.entry
 * @param {number} params.stop
 * @param {number[]} params.take_profits
 * @param {number} params.size
 * @param {number} params.risk_amount
 * @param {number} params.rr_to_tp1
 * @param {string} [params.reasoning]
 * @returns {{ success: true, paper: true, order_id: string, fills: object, audit_logged: true }}
 */
export function paperPlaceBracket(params) {
  const orderId = nextPaperId('PAPER');
  const entry = {
    broker: params.broker,
    symbol: params.symbol,
    tv_symbol: params.tv_symbol,
    side: params.side,
    order_type: 'bracket',
    entry: params.entry,
    stop: params.stop,
    take_profits: params.take_profits,
    size: params.size,
    risk_amount: params.risk_amount,
    rr_to_tp1: params.rr_to_tp1,
    paper: true,
    reasoning: params.reasoning || '',
    broker_order_id: orderId,
  };
  logOrder(entry);

  return {
    success: true,
    paper: true,
    order_id: orderId,
    fills: {
      // In paper mode we simulate an instant fill at the requested entry.
      entry_filled_at: params.entry,
      stop_armed_at: params.stop,
      take_profits_armed_at: params.take_profits,
    },
    audit_logged: true,
    note: 'PAPER TRADING — no real order submitted. Flip PAPER_TRADING=0 to enable live.',
  };
}

/**
 * Paper-mode single-leg order (limit or market). For testing without bracket.
 */
export function paperPlaceSingle({ broker, symbol, tv_symbol, side, order_type, price, size, reasoning }) {
  const orderId = nextPaperId('PAPER');
  logOrder({
    broker, symbol, tv_symbol, side, order_type,
    entry: price, stop: null, take_profits: [],
    size, risk_amount: null, rr_to_tp1: null,
    paper: true, reasoning: reasoning || '',
    broker_order_id: orderId,
  });
  return { success: true, paper: true, order_id: orderId, filled_at: price, audit_logged: true };
}

/**
 * Paper cancel — no-op on real broker side, but writes a cancellation entry.
 */
export function paperCancel({ broker, order_id, reason }) {
  logOrder({
    broker, symbol: null, tv_symbol: null, side: null,
    order_type: 'cancel',
    entry: null, stop: null, take_profits: [],
    size: null, risk_amount: null, rr_to_tp1: null,
    paper: true,
    reasoning: `cancel: ${reason || 'no reason given'}`,
    broker_order_id: order_id,
  });
  return { success: true, paper: true, cancelled_id: order_id };
}
