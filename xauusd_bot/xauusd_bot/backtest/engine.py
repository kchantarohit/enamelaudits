"""Event-driven bar backtester with realistic bid/ask, partial-tier legs and breakers.

Price convention: OHLC are BID prices (MetaTrader charts). Ask = bid + spread.
  long : buy-limit fills when ask reaches entry; exits are sells at bid
  short: sell-limit fills when bid reaches entry; exits are buys at ask
Conservative intrabar rules:
  * on the fill bar only the stop can be hit (no TP credit)
  * if stop and a TP are both inside one bar, the stop wins
  * stop updates (BE / trail) decided on bar close, effective next bar
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..config import BotConfig
from ..risk import RiskGuard, position_size, split_legs
from ..strategy import Setup, compute_features, generate_setups
from ..trade_manager import StopState, update_stop


@dataclass
class Leg:
    volume: float
    tp: float
    open: bool = True
    exit_price: float = np.nan
    exit_time: pd.Timestamp | None = None
    reason: str = ""


@dataclass
class Trade:
    id: int
    setup: Setup
    volume: float
    legs: list
    placed_bar: int
    fill_bar: int = -1
    fill_time: pd.Timestamp | None = None
    fill_price: float = np.nan
    st: StopState | None = None
    pnl: float = 0.0
    closed: bool = False
    exit_time: pd.Timestamp | None = None
    exit_reason: str = ""
    max_fav_r: float = 0.0
    max_adv_r: float = 0.0

    @property
    def open_legs(self) -> list:
        return [lg for lg in self.legs if lg.open]


@dataclass
class BacktestResult:
    trades: pd.DataFrame
    equity: pd.Series
    events: list = field(default_factory=list)
    setups: int = 0
    initial_balance: float = 0.0


def session_label(t: pd.Timestamp) -> str:
    h = t.hour
    if 7 <= h < 12:
        return "london"
    if 12 <= h < 17:
        return "new_york"
    return "asia/other"


class Backtester:
    def __init__(self, cfg: BotConfig):
        self.cfg = cfg

    def run(self, df: pd.DataFrame, features: pd.DataFrame | None = None, setups: list[Setup] | None = None,
            trade_start: pd.Timestamp | None = None, trade_end: pd.Timestamp | None = None) -> BacktestResult:
        cfg, inst, m = self.cfg, self.cfg.instrument, self.cfg.management
        f = features if features is not None else compute_features(df, cfg)
        if setups is None:
            setups = generate_setups(df, cfg, features=f)
        idx = f.index
        o, h, l, c = (f[k].to_numpy() for k in ("open", "high", "low", "close"))
        a = f["atr"].to_numpy()
        n = len(f)
        start_i = 0 if trade_start is None else int(idx.searchsorted(trade_start))
        end_i = n if trade_end is None else int(idx.searchsorted(trade_end))
        by_bar: dict[int, list[Setup]] = {}
        for s in setups:
            if start_i <= s.bar < end_i:
                by_bar.setdefault(s.bar, []).append(s)

        spread, slip, cs, comm = inst.spread, inst.slippage, inst.contract_size, inst.commission_per_lot
        balance = cfg.backtest.initial_balance
        guard = RiskGuard(cfg.risk)
        pending: list[Trade] = []
        live: list[Trade] = []
        done: list[Trade] = []
        eq_t, eq_v = [], []
        tid = 0

        def close_leg(tr: Trade, lg: Leg, price: float, t, reason: str) -> None:
            nonlocal balance
            d = tr.setup.direction
            pnl = d * (price - tr.fill_price) * lg.volume * cs - comm * lg.volume
            lg.open, lg.exit_price, lg.exit_time, lg.reason = False, price, t, reason
            tr.pnl += pnl
            balance += pnl
            if not tr.open_legs:
                tr.closed, tr.exit_time, tr.exit_reason = True, t, reason
                guard.on_trade_closed(tr.pnl)

        def market_exit_price(d: int, bid: float) -> float:
            return bid - slip if d == 1 else bid + spread + slip

        def flatten(i: int, reason: str) -> None:
            for tr in live:
                for lg in tr.open_legs:
                    close_leg(tr, lg, market_exit_price(tr.setup.direction, c[i]), idx[i], reason)
            pending.clear()

        def mtm(i: int) -> float:
            u = 0.0
            for tr in live:
                d = tr.setup.direction
                px = c[i] if d == 1 else c[i] + spread
                u += sum(d * (px - tr.fill_price) * lg.volume * cs for lg in tr.open_legs)
            return balance + u

        for i in range(start_i, min(end_i + 1, n)):
            t = idx[i]
            guard.on_time(t, mtm(i - 1) if i > 0 else balance)
            last_bar = i >= end_i or i == n - 1

            # ---- pending limit orders: expire / fill ----
            for tr in list(pending):
                s = tr.setup
                if i > s.expiry_bar or guard.halted_day == guard.day or guard.killed:
                    pending.remove(tr)
                    continue
                d = s.direction
                if d == 1 and l[i] + spread <= s.entry:
                    fill = min(s.entry, o[i] + spread)
                elif d == -1 and h[i] >= s.entry:
                    fill = max(s.entry, o[i])
                else:
                    continue
                pending.remove(tr)
                tr.fill_bar, tr.fill_time, tr.fill_price = i, t, fill
                tr.st = StopState(d, fill, s.sl, s.sl, [lg.tp for lg in tr.legs], fill)
                live.append(tr)
                # conservative: stop may be hit on the fill bar, TPs may not
                hit = (l[i] <= s.sl) if d == 1 else (h[i] + spread >= s.sl)
                if hit:
                    px = s.sl - slip if d == 1 else s.sl + slip
                    for lg in tr.open_legs:
                        close_leg(tr, lg, px, t, "sl")

            # ---- manage positions filled on earlier bars ----
            for tr in live:
                if tr.closed or tr.fill_bar == i:
                    continue
                d, st = tr.setup.direction, tr.st
                bid_lo, bid_hi, bid_o = l[i], h[i], o[i]
                ask_lo, ask_hi, ask_o = l[i] + spread, h[i] + spread, o[i] + spread
                stop = st.stop
                reason = "sl" if not st.be_done and st.tps_hit == 0 else ("be" if st.tps_hit == 0 else "trail")
                # gap through stop at the open
                if (d == 1 and bid_o <= stop) or (d == -1 and ask_o >= stop):
                    px = (bid_o - slip) if d == 1 else (ask_o + slip)
                    for lg in tr.open_legs:
                        close_leg(tr, lg, px, t, reason)
                    continue
                stop_hit = (bid_lo <= stop) if d == 1 else (ask_hi >= stop)
                if stop_hit and cfg.backtest.conservative_intrabar:
                    px = stop - slip if d == 1 else stop + slip
                    for lg in tr.open_legs:
                        close_leg(tr, lg, px, t, reason)
                    continue
                for k, lg in enumerate(tr.legs):
                    if lg.open and ((d == 1 and bid_hi >= lg.tp) or (d == -1 and ask_lo <= lg.tp)):
                        close_leg(tr, lg, lg.tp, t, f"tp{k + 1}")
                        st.tps_hit = max(st.tps_hit, k + 1)
                if stop_hit and tr.open_legs:  # non-conservative mode: TP first then stop
                    px = stop - slip if d == 1 else stop + slip
                    for lg in tr.open_legs:
                        close_leg(tr, lg, px, t, reason)

            # ---- end-of-bar management: excursions, BE / trail, time & weekend stops ----
            for tr in live:
                if tr.closed:
                    continue
                st, d = tr.st, tr.setup.direction
                fav = (h[i] - st.entry) if d == 1 else (st.entry - (l[i] + spread))
                adv = (st.entry - l[i]) if d == 1 else ((h[i] + spread) - st.entry)
                tr.max_fav_r = max(tr.max_fav_r, fav / st.risk)
                tr.max_adv_r = max(tr.max_adv_r, adv / st.risk)
                if tr.fill_bar != i:  # fill-bar extremes may predate the fill: don't use them
                    update_stop(st, h[i], l[i] + (spread if d == -1 else 0.0), a[i], m)
                weekend = m.close_before_weekend and t.dayofweek == 4 and t.hour >= m.weekend_close_hour
                if i - tr.fill_bar >= m.max_hold_bars or weekend or last_bar:
                    why = "time" if i - tr.fill_bar >= m.max_hold_bars else ("weekend" if weekend else "end")
                    for lg in tr.open_legs:
                        close_leg(tr, lg, market_exit_price(d, c[i]), t, why)
            if m.close_before_weekend and t.dayofweek == 4 and t.hour >= m.weekend_close_hour:
                pending.clear()
            done.extend(tr for tr in live if tr.closed)
            live = [tr for tr in live if not tr.closed]

            # ---- circuit breakers on marked-to-market equity ----
            eq = mtm(i)
            if guard.check_equity(t, eq) == "flatten":
                flatten(i, "circuit_breaker")
                done.extend(tr for tr in live if tr.closed)
                live = [tr for tr in live if not tr.closed]
                eq = balance
            eq_t.append(t)
            eq_v.append(eq)
            if last_bar:
                pending.clear()
                break

            # ---- new setups from this bar's close -> resting limit orders ----
            for s in by_bar.get(i, []):
                vol = position_size(balance, cfg.risk.risk_per_trade, s.entry, s.sl, inst)
                if vol <= 0:
                    continue
                risk_cash = (s.risk + spread + slip) * vol * cs + comm * vol
                ok, _why = guard.can_open(eq, risk_cash, len(live) + len(pending))
                if not ok:
                    continue
                vols = split_legs(vol, m.tp_weights, inst)
                legs = [Leg(v, s.tps[k]) for k, v in enumerate(vols)]
                tid += 1
                pending.append(Trade(tid, s, vol, legs, i))
                guard.on_order_placed()

        done.extend(live)
        return BacktestResult(self._trades_frame(done), pd.Series(eq_v, index=pd.DatetimeIndex(eq_t), name="equity"),
                              guard.events, len(by_bar), cfg.backtest.initial_balance)

    def _trades_frame(self, trades: list[Trade]) -> pd.DataFrame:
        cs = self.cfg.instrument.contract_size
        rows = []
        for tr in trades:
            if tr.fill_bar < 0:
                continue
            s = tr.setup
            risk_cash = s.risk * tr.volume * cs
            rows.append({
                "id": tr.id, "signal_time": s.time, "fill_time": tr.fill_time, "exit_time": tr.exit_time,
                "direction": "long" if s.direction == 1 else "short", "entry": tr.fill_price, "sl": s.sl,
                "risk_price": s.risk, "volume": tr.volume, "legs": len(tr.legs),
                "tps_hit": sum(lg.reason.startswith("tp") for lg in tr.legs),
                "exit_reason": tr.exit_reason, "pnl": tr.pnl, "r": tr.pnl / risk_cash if risk_cash else 0.0,
                "mfe_r": tr.max_fav_r, "mae_r": tr.max_adv_r, "score": s.score,
                "session": session_label(s.time), **{f"f_{k}": v for k, v in s.factors.items()},
            })
        cols = ["id", "signal_time", "fill_time", "exit_time", "direction", "entry", "sl", "risk_price", "volume",
                "legs", "tps_hit", "exit_reason", "pnl", "r", "mfe_r", "mae_r", "score", "session"]
        return pd.DataFrame(rows, columns=None if rows else cols)
