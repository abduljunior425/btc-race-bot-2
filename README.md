# btc-race-bot-2

![competition](https://make.fun/badge/btc-race-24h-20261117-0603.svg)
![rank](https://make.fun/badge/btc-race-24h-20261117-0603/abduljunior425/btc-race-bot-2/rank.svg)
![reward](https://make.fun/badge/btc-race-24h-20261117-0603/abduljunior425/btc-race-bot-2/reward.svg)

Entry for the [Race a BTC trading bot live for 24 hours](https://make.fun/competitions/btc-race-24h-20261117-0603)
bounty (`btc-race-24h-20261117-0603`, $250): a bot that trades cbBTC/USDC
on 1-minute on-chain bars, starting with $1,000 USDC, long only.

## Strategy: dip-buy and hold

A full-size round trip costs ~30–40 bps in fees, slippage and price impact,
so frequent signals (EMA crosses, RSI flips) lose to fees on a choppy day.
This bot trades at most once:

- **Entry:** the close falls at least 1.2% below the highest close of the
  last 240 bars (4 hours) — a genuine dip, not 1-minute noise. It buys in
  full (100% of equity).
- **Relaxing threshold:** so the bot almost always gets its one trade even
  in a window with no deep dip — 1.2% for the first 720 bars, 0.8% until
  bar 1200, 0.5% after that; if still flat with 40 bars left it buys at
  the market.
- **Exit:** only the stop-loss (position worth 1.5% under its cost at a
  close) or the harness's final flatten. No take-profit, no trailing stop:
  on the dev window both sold the rally early and re-entry attempts lost
  money, so a winner is held to the end.
- **One entry ever:** after the stop-loss fires the bot stays in cash.
  A buy the market refuses (price past the slippage cap at the next open)
  is sent again on the next bar while the dip signal still holds.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib only)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `agent-fun/bars-replay/v1` shim
- `LICENSE` — MIT

## Local grade (dev window)

```
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```
