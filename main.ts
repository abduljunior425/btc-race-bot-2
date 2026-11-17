// btc-race-bot-2: dip-buy and hold, long only.
//
// Idea: on 1-minute cbBTC bars the round trip costs ~30-40 bps at full size,
// so frequent signals (EMA crosses, RSI flips) lose to fees on a choppy day.
// This bot trades at most once: it waits for a real pullback, buys it in full,
// then holds to the end of the window, with only a stop-loss to cap a slide.
//
//   - Pullback: the close falls at least DROP below the highest close of the
//     last 240 bars (4 hours). A 1%+ pullback from a 4-hour high is a genuine
//     dip, not 1-minute noise.
//   - The required drop relaxes as the window runs out, so the bot almost
//     always gets its one trade even in a window with no deep dip: 1.2% for
//     the first 720 bars, 0.8% until bar 1200, 0.5% after that. If it is
//     still flat with 40 bars left it buys at the market, so it never ends
//     a window with zero trades.
//   - Exit: only the stop-loss (position worth 1.5% under its cost at a
//     close) or the harness's final flatten. No take-profit, no trailing
//     stop: on the dev window both sold the rally early and re-entry
//     attempts lost money, so a winner is held to the end.
//   - One entry ever: after the stop-loss fires the bot stays in cash.
//     A buy the market refuses (price past the slippage cap at the next
//     open) is sent again on the next bar while the dip signal still holds.
//
// Determinism: float64 arithmetic on + - * / and comparisons only, no clock,
// no environment, no randomness. The same bars give the same orders, run
// after run.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Rolling-high window: 240 one-minute bars (4 hours). */
const HIGH_BARS = 240;
/** Required drop below the rolling high, by stage of the window. */
const DROP_EARLY = 0.012;
const DROP_MID = 0.008;
const DROP_LATE = 0.005;
/** Bars seen before the threshold relaxes. */
const MID_AFTER_BARS = 720;
const LATE_AFTER_BARS = 1200;
/** Last-resort buy when this many bars of the window remain. */
const LAST_RESORT_BARS_LEFT = 40;
/** Slippage cap per order, 1% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** Total bars in a window (1,440 one-minute bars). */
const WINDOW_BARS = 1440;

/** Closes seen so far, oldest first, at most HIGH_BARS long. */
const closes: number[] = [];
/** Bars of CBBTC actually seen (gaps add nothing). */
let barsSeen = 0;
/** True once the bot has ever held a position (one entry ever). */
let entered = false;
/** Client id of a buy sent on the previous batch and not yet resolved. */
let pendingBuy: string | null = null;

function rollingHigh(): number {
  let high = -Infinity;
  for (const c of closes) if (c > high) high = c;
  return high;
}

function dropNeeded(): number {
  if (barsSeen < MID_AFTER_BARS) return DROP_EARLY;
  if (barsSeen < LATE_AFTER_BARS) return DROP_MID;
  return DROP_LATE;
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Resolve a buy sent on the previous batch: filled means the position
    // will show in state; rejected means it may be sent again.
    if (pendingBuy !== null) {
      for (const fill of batch.fills) {
        if (fill.client_id === pendingBuy) {
          pendingBuy = null;
          if (fill.status === 'filled') entered = true;
        }
      }
    }

    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      fresh = true;
      closes.push(Number(bar.c));
      if (closes.length > HIGH_BARS) closes.shift();
      barsSeen++;
    }
    if (state.warmingUp || !fresh) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      entered = true;
      const value = state.value(SYMBOL, held.qty);
      // Stop-loss: worth 1.5% under cost, in integers (value * 1000 <= cost * 985).
      if (value * 1000n <= held.cost * 985n) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }

    // Flat: no second entry after the one position is gone.
    if (entered || pendingBuy !== null) return [];

    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);

    const barsLeft = WINDOW_BARS - barsSeen;
    let buy = false;
    if (barsLeft <= LAST_RESORT_BARS_LEFT && barsSeen >= HIGH_BARS) {
      buy = true;
    } else if (closes.length >= HIGH_BARS) {
      const high = rollingHigh();
      if (closeNum < high * (1 - dropNeeded())) buy = true;
    }
    if (!buy) return [];

    const { fees } = state.hello;
    const notional = state.cash;
    if (notional < BigInt(fees.min_notional_quote_units)) return [];
    const order: BuyInput = {
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: notional,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    };
    pendingBuy = state.clientId();
    order.client_id = pendingBuy;
    return [order];
  },
});
