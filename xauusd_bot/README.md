# XAUUSD Multi-Timeframe SMC Bot

A Python trading system for XAUUSD (spot gold). It finds high-confluence Smart-Money-Concepts
setups (a liquidity sweep, then a displacement break of structure, then an order-block limit entry),
filters them with a higher-timeframe trend bias, sessions, a volatility regime, a volume profile and RSI,
and manages each trade with tiered take-profits at 2R / 3R / 5R, a breakeven stop and a trailing runner.
The same strategy and risk code runs in the backtester, the paper broker and the MetaTrader 5 live adapter.

> **Read this first: what to expect.** The validation suite is the most valuable part of this project,
> more than the entry logic. A >80% win rate with an average winner of 2R or more would be an
> extraordinary edge. No honest backtest can promise one, and this code doesn't claim to. Nobody can say what this
> strategy will do on real gold data until you run `validate` on your broker's history (see below). It is designed
> to *tell you the truth* about that, including "no edge, don't trade it".

---

## 1. Architecture

```
xauusd_bot/
├── config.py            typed config + safety validation (risk ≤ 2%, TPs ≥ 2R, …)
├── logger.py            console/file logging + JSONL trade journal
├── data/
│   ├── loaders.py       CSV (MT5 / Dukascopy / generic), MT5, yfinance; resample; causal HTF alignment
│   └── synthetic.py     gold-like random data with NO edge (for plumbing tests only)
├── indicators.py        EMA, RSI, ATR, ATR percentile, rolling volume profile (POC/VAL/VAH)
├── structure.py         swing points → liquidity sweep → BOS → order block (one causal pass)
├── strategy.py          feature frame + mandatory gates + confluence scoring → Setup objects
├── risk.py              position sizing, TP-leg split, RiskGuard (daily DD, kill switch, loss streak)
├── trade_manager.py     breakeven / lock / ATR-trail rules (shared by backtest and live)
├── backtest/
│   ├── engine.py        bid/ask bar engine, conservative intrabar fills, legs, breakers
│   ├── metrics.py       Sharpe, Sortino, deflated Sharpe, MaxDD, PF, expectancy, win-rate breakdown, Monte Carlo
│   └── validation.py    walk-forward optimisation, purged blocked CV, PBO (CSCV), holdout
├── execution/
│   ├── base.py          Broker interface (a trade is a group of legs, each with server-side SL + TP)
│   ├── paper.py         replays history through the LIVE code path (dry run)
│   └── mt5.py           MetaTrader 5 adapter (Windows)
├── live.py              polling loop: breaker → sync → manage stops → new setups → orders; state persisted
├── report.py            JSON / CSV / breakdown tables / equity PNG
└── __main__.py          CLI
```

## 2. Strategy logic

Each bar's decision uses only bars that have closed by then. A test checks this by appending future data and asserting that nothing earlier changes.

**Mandatory gates (all must pass)**

| Gate | Rule |
|---|---|
| HTF bias (H4, closed bars only) | Longs need close > EMA200 and EMA50 > EMA200. Shorts are the mirror image. |
| Liquidity sweep | A wick trades through a confirmed swing low/high (confirmed `swing_len` bars after it prints). Price closes back inside within 2 bars. |
| Break of structure | Within `bos_window` bars, a candle with body ≥ `displacement_atr` × ATR closes beyond the swing high/low that preceded the sweep. |
| Order block entry | The limit sits at the last opposite-colour candle before the displacement (proximal edge or midpoint). It expires after `order_expiry_bars`. |
| Stop | Beyond the OB or sweep extreme, plus `sl_atr_buffer` × ATR. Its distance must be within [`min_sl_atr`, `max_sl_atr`] × ATR. |
| Session | London 07–11 UTC or New York 12–16 UTC. No new setups late on Friday. |
| Volatility | LTF ATR percentile is between 20% and 95%. This skips dead markets and news chaos. |
| Room | Opposing liquidity is at least 2R away. |

**Confluence factors (need `min_confluence` of 5)**: RSI exhaustion at the sweep, a fair-value gap in the
displacement, entry in discount/premium (beyond 50% of the dealing range), entry near POC/VAL/VAH
of the rolling volume profile, and the LTF EMA50/200 agreeing with the trade.

Shorts come from running the **same** long scanner on a price-mirrored series, so long and short logic
is symmetric by construction.

## 3. Trade management and risk

* **Sizing**: lots are set so that a hard-SL hit *including spread, slippage and commission* loses at most
  `risk_per_trade` (default 1%). Config validation rejects anything above 2%. If even the minimum lot would exceed
  the budget, the trade is skipped. It is never rounded up.
* **Tiered exits**: the position is split into legs: 40% at 2R, 30% at 3R and 30% at 5R. **Every leg is a separate broker order
  with its own server-side SL and TP**, so the protection survives if the bot crashes or loses connection.
* **Breakeven**: when price reaches `breakeven_trigger_r` (1.0, or 1.5 via config/grid), the stop moves to entry + 0.05R to cover costs.
* **Runner**: after TP2, the stop locks at TP1 and then trails at 2.5 × ATR (chandelier).
* **Time stop** at 2 days. Positions are flattened before the weekend (Friday 20:00 UTC).
* **RiskGuard** (identical in backtest and live):
  * daily drawdown circuit breaker: if equity falls 3% below the day-start equity, flatten everything, cancel orders and halt until the next day
  * pre-trade risk budget: a trade whose stop-out *could* breach the daily limit is not placed
  * 15% peak-to-trough **kill switch**, which stops trading until you manually delete the state file
  * at most 3 trades per day and 1 open position; trading pauses after 4 consecutive losses

## 4. Backtest realism

* OHLC are treated as **bid**. Longs buy at the ask (bid + spread) and exit at the bid. Shorts do the opposite.
* Stops pay slippage. Gaps through a stop fill at the open, not at the stop.
* **Conservative intrabar rules**: if the stop and a TP are both inside one bar, the stop wins. A TP is never credited on the fill bar.
  Breakeven and trail changes are decided at a bar's close and apply from the next bar. Fill-bar extremes are ignored.
* Commission defaults to $7 per lot round turn and spread to $0.25. **Set both to your broker's real values.**

## 5. Robustness / anti-overfitting (`validate`)

1. **Holdout**: the last *N* months (default 6) are cut off first. Walk-forward and CV never see them.
2. **Walk-forward optimisation**: rolling 12-month in-sample and 3-month out-of-sample windows, stepping 3 months.
   * The objective is *shrunk* expectancy, Σ R / (n + 5), so a lucky handful of trades can't win.
   * **Plateau selection**: each grid point is scored by the mean of its grid neighbourhood, so isolated spikes lose.
   * The OOS segments are stitched into one equity curve. The output also reports walk-forward efficiency and how often each parameter value was chosen.
3. **Purged blocked K-fold CV** (8 folds with a 5-day embargo). Trades never cross fold boundaries.
4. **PBO**, the Probability of Backtest Overfitting (Bailey et al. CSCV), from the combos × folds score matrix.
   Below 0.2 is good. At 0.5 or above, parameter selection is no better than chance.
5. **Deflated Sharpe ratio**: the probability that the Sharpe is real after accounting for the number of configurations tried.
6. **Monte Carlo** bootstrap of the R sequence: median and 95th-percentile drawdown, and the probability of a loss.
7. A **verdict** line that FAILS if OOS expectancy ≤ 0, PBO ≥ 0.5, holdout expectancy ≤ 0, or there are fewer than 30 OOS trades.

Keep the grid small (default 3×3×2 = 18 combos). Every extra knob raises the chance of overfitting. Run
the holdout **once**. If you tune after looking at it, it is no longer out-of-sample.

### Win-rate definitions (reported separately, on purpose)

Partial exits and breakeven stops make "win rate" ambiguous, so the output reports each version separately:

* `win_rate`: trades with net R > +0.1
* `win_rate_ex_scratch`: wins / (wins + losses), ignoring breakeven scratches
* `non_loss_rate`: wins + scratches. This is the number that breakeven management inflates.
* `tp1_hit_rate`: the share of trades that reached 2R

Moving the stop to breakeven earlier raises `non_loss_rate` but usually *lowers* expectancy, because it turns some
winners into scratches. Optimise **expectancy and drawdown, not win rate**.

## 6. Setup

```bash
cd xauusd_bot
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install MetaTrader5                                  # Windows only, for live/MT5 data
python -m pytest -q                                      # engine, risk, causality and live-parity tests
```

### Get data

The best data comes from **your broker's own M15 (or M1) XAUUSD history**, because spreads, session times and prices
match what you will trade.

* **MT5**: open the History Center or Symbols dialog → Bars → XAUUSD M15 → Export. The CSV with `<DATE> <TIME> …` columns loads as-is.
* **Dukascopy** CSV exports (`Gmt time,Open,High,Low,Close,Volume`) also load as-is.
* M1 data is resampled automatically to the `ltf` timeframe.
* Use at least 4–5 years. The strategy is selective and trades about 1–2 times a month, so less data
  won't produce enough trades for any statistic to mean anything.

```bash
python -m xauusd_bot synth --out data/synthetic_m15.csv   # pipeline test data only (no edge)
```

### Backtest, walk-forward, validate

```bash
python -m xauusd_bot backtest    --data data/XAUUSD_M15.csv --config config/default.yaml
python -m xauusd_bot walkforward --data data/XAUUSD_M15.csv
python -m xauusd_bot validate    --data data/XAUUSD_M15.csv --holdout-months 6
```

Results go to `results/`: `*_summary.json`, `*_trades.csv`, `*_equity.csv`, `*_breakdown.txt`
(win rate and expectancy by direction, session, exit reason, confluence score, year and TPs hit), plus
`*_equity.png` if matplotlib is installed.

### Paper (dry-run the live code path)

```bash
python -m xauusd_bot paper --data data/XAUUSD_M15.csv --bars 3000
```

This replays the last 3000 bars through `LiveTrader` with the paper broker and writes `logs/journal.jsonl`.
`tests/test_live_parity.py` checks that this path places exactly the orders the backtester generates.

### Live (MetaTrader 5)

1. Use a **demo account first**, and run it for weeks. A **hedging** account is recommended because each TP leg is its own position.
2. Copy `config/default.yaml` to `config/live.yaml` and set:
   ```yaml
   live:
     broker: mt5
     mt5_login: 12345678
     mt5_server: "YourBroker-Demo"
     max_spread: 0.6
   instrument:
     symbol: XAUUSD        # match your broker's name exactly, e.g. XAUUSD.r, GOLD
     commission_per_lot: 7.0
     spread: 0.25
   ```
   Put the password in the `MT5_PASSWORD` environment variable, not in the file.
3. Keep the MT5 terminal open with Algo Trading enabled, then run:
   ```bash
   set MT5_PASSWORD=...            # PowerShell: $env:MT5_PASSWORD="..."
   python -m xauusd_bot live --config config/live.yaml
   ```

Live behaviour:

* Contract size and volume steps are read from the broker.
* The server-time offset is auto-detected, and everything runs in UTC.
* The forming bar is never used.
* Every poll (5 s) checks equity against the daily-drawdown breaker.
* Every new M15 bar: sync fills and TP hits, move stops, generate setups, place orders.
* State lives in `state/live_state.json`, so restarts resume safely.
* Each decision is written to `logs/journal.jsonl`, including skipped setups and the reason they were skipped.

**Before going live**: validate on real data, paper/demo trade for at least 1–2 months, and compare live fills
to backtest assumptions, especially spread at the London and NY opens and slippage on stops. Start at 0.25–0.5% risk.

## 7. Tuning knobs worth exploring (inside walk-forward only)

`strategy.displacement_atr`, `strategy.min_confluence`, `management.breakeven_trigger_r`, `strategy.swing_len`,
`strategy.ob_entry`, `strategy.sessions`, `management.tp_weights`. Add them to `walkforward.grid`, never
tune them on the full history.

## Disclaimer

This is research software, not financial advice. Leveraged gold CFDs can lose more than your deposit.
Past or simulated performance does not guarantee future results.
