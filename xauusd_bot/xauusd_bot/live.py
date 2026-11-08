"""Live / paper trading loop.

Every poll   : intrabar equity check -> daily-DD circuit breaker / kill switch.
Every new bar: sync broker state -> manage stops (BE / trail / time / weekend)
               -> generate setups on the just-closed bar -> place limit groups.
State (risk guard + open groups) is persisted to JSON so a restart resumes safely.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict
from pathlib import Path

import pandas as pd

from .config import BotConfig
from .data.loaders import to_timedelta
from .execution.base import Broker
from .logger import TradeJournal
from .risk import RiskGuard, position_size, split_legs
from .strategy import compute_features, generate_setups
from .trade_manager import StopState, update_stop

log = logging.getLogger("live")


class LiveTrader:
    def __init__(self, cfg: BotConfig, broker: Broker):
        self.cfg, self.broker = cfg, broker
        self.state_path = Path(cfg.live.state_dir) / "live_state.json"
        self.journal = TradeJournal(Path(cfg.log_dir) / "journal.jsonl")
        self.guard = RiskGuard(cfg.risk)
        self.groups: dict[str, dict] = {}
        self.last_bar: pd.Timestamp | None = None
        self._load()

    # ---------- persistence ----------
    def _load(self) -> None:
        if self.state_path.exists():
            d = json.loads(self.state_path.read_text())
            self.guard = RiskGuard.from_dict(self.cfg.risk, d.get("guard", {}))
            self.groups = d.get("groups", {})
            self.last_bar = pd.Timestamp(d["last_bar"]) if d.get("last_bar") else None
            log.info("restored state: %d groups, guard=%s", len(self.groups), self.guard.to_dict())

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"guard": self.guard.to_dict(), "groups": self.groups,
                                   "last_bar": str(self.last_bar) if self.last_bar is not None else None},
                                  default=str, indent=1))
        tmp.replace(self.state_path)

    # ---------- main entry points ----------
    def start(self) -> None:
        self.broker.connect()
        sp = self.broker.spec()
        inst = self.cfg.instrument
        inst.contract_size, inst.volume_min, inst.volume_step, inst.volume_max, inst.tick_size = (
            sp.contract_size, sp.volume_min, sp.volume_step, sp.volume_max, sp.tick_size)
        log.info("symbol spec from broker: %s", sp)

    def run_forever(self) -> None:
        self.start()
        try:
            while True:
                try:
                    self.poll()
                except Exception:  # keep running; protective orders are on the server
                    log.exception("poll failed")
                time.sleep(self.cfg.live.poll_seconds)
        finally:
            self._save()
            self.broker.shutdown()

    def poll(self) -> None:
        eq = self.broker.equity()
        self.guard.on_time(self.broker.now(), eq)
        if self.guard.check_equity(self.broker.now(), eq) == "flatten":
            log.error("CIRCUIT BREAKER: equity %.2f (day start %.2f, peak %.2f) -> flatten", eq,
                      self.guard.day_start_equity, self.guard.peak_equity)
            self.broker.flatten()
            self.journal.write("circuit_breaker", equity=eq, guard=self.guard.to_dict())
            self._save()
        bars = self.broker.bars(self.cfg.live.history_bars)
        if bars.empty or (self.last_bar is not None and bars.index[-1] <= self.last_bar):
            return
        self.last_bar = bars.index[-1]
        self.on_bar(bars)
        self._save()

    # ---------- per closed bar ----------
    def on_bar(self, bars: pd.DataFrame) -> None:
        cfg, m = self.cfg, self.cfg.management
        f = compute_features(bars, cfg)
        last = f.iloc[-1]
        t = f.index[-1]
        self._sync(t)
        orders, positions = self.broker.orders(), self.broker.positions()
        friday_close = m.close_before_weekend and t.dayofweek == 4 and t.hour >= m.weekend_close_hour

        for gid, g in list(self.groups.items()):
            g_orders = [o for o in orders if o.group == gid]
            g_pos = [p for p in positions if p.group == gid]
            if g_orders and (friday_close or t >= pd.Timestamp(g["expiry"]) or self.guard.halted_day == self.guard.day):
                for o in g_orders:
                    self.broker.cancel(o.ticket)
                self.journal.write("cancel", group=gid, reason="expiry/weekend/halt")
            if not g_pos or g.get("st") is None:
                continue
            st = StopState(**g["st"])
            g["bars_held"] = g.get("bars_held", 0) + 1
            if g["bars_held"] >= m.max_hold_bars or friday_close:
                for p in g_pos:
                    self.broker.close(p.ticket)
                self.journal.write("exit", group=gid, reason="time" if not friday_close else "weekend")
                continue
            sp = self.broker.spread()
            old = st.stop
            new = update_stop(st, float(last.high), float(last.low) + (sp if st.direction == -1 else 0.0),
                              float(last.atr), m)
            if new != old:
                for p in g_pos:
                    self.broker.modify_sl(p.ticket, new)
                self.journal.write("move_sl", group=gid, old=old, new=new, tps_hit=st.tps_hit, be=st.be_done)
            g["st"] = asdict(st)

        if friday_close:
            return
        self._maybe_enter(bars, f, t)

    def _sync(self, t: pd.Timestamp) -> None:
        orders, positions = self.broker.orders(), self.broker.positions()
        for gid, g in list(self.groups.items()):
            live_o = {o.ticket for o in orders if o.group == gid}
            g_pos = [p for p in positions if p.group == gid]
            live_p = {p.ticket for p in g_pos}
            if g_pos and g.get("st") is None:
                px = sum(p.price_open * p.volume for p in g_pos) / sum(p.volume for p in g_pos)
                g["st"] = asdict(StopState(g["direction"], px, g["sl"], g["sl"], g["tps"], px))
                g["fill_time"], g["bars_held"] = str(t), 0
                self.journal.write("fill", group=gid, price=px)
            if g.get("st") is not None and g_pos:
                closed = [tk for tk in g["tickets"] if tk not in live_o and tk not in live_p]
                st = g["st"]
                st["tps_hit"] = max(st["tps_hit"], len(closed))   # legs close in TP order
            if not live_o and not live_p:
                if g.get("st") is not None:
                    pnl = self.broker.realized_pnl(g["tickets"])
                    self.guard.on_trade_closed(pnl)
                    self.journal.write("closed", group=gid, pnl=pnl, risk_cash=g.get("risk_cash"),
                                       r=pnl / g["risk_cash"] if g.get("risk_cash") else None)
                    log.info("group %s closed pnl=%.2f", gid, pnl)
                else:
                    self.journal.write("expired", group=gid)
                del self.groups[gid]

    def _maybe_enter(self, bars: pd.DataFrame, f: pd.DataFrame, t: pd.Timestamp) -> None:
        cfg, inst = self.cfg, self.cfg.instrument
        setups = [s for s in generate_setups(bars, cfg, features=f) if s.bar == len(f) - 1]
        for s in setups:
            spread = self.broker.spread()
            if spread > cfg.live.max_spread:
                self.journal.write("skip", reason="spread", spread=spread, setup=s.to_dict())
                continue
            bal, eq = self.broker.balance(), self.broker.equity()
            vol = position_size(bal, cfg.risk.risk_per_trade, s.entry, s.sl, inst)
            if vol <= 0:
                self.journal.write("skip", reason="size_below_min", setup=s.to_dict())
                continue
            risk_cash = (s.risk + spread + inst.slippage) * vol * inst.contract_size + inst.commission_per_lot * vol
            ok, why = self.guard.can_open(eq, risk_cash, len(self.groups))
            if not ok:
                self.journal.write("skip", reason=why, setup=s.to_dict())
                continue
            legs = split_legs(vol, cfg.management.tp_weights, inst)
            gid = f"xau{t.strftime('%y%m%d%H%M')}{'L' if s.direction == 1 else 'S'}"
            expiry = t + to_timedelta(cfg.timeframes.ltf) * (cfg.strategy.order_expiry_bars + 1)
            tickets = self.broker.place_limit_group(gid, s.direction, s.entry, s.sl,
                                                    [(v, s.tps[k]) for k, v in enumerate(legs)], expiry)
            if not tickets:
                self.journal.write("order_failed", setup=s.to_dict())
                continue
            self.guard.on_order_placed()
            self.groups[gid] = {"direction": s.direction, "entry": s.entry, "sl": s.sl, "tps": s.tps[:len(legs)],
                                "tickets": tickets, "expiry": str(expiry), "risk_cash": s.risk * vol * inst.contract_size,
                                "st": None, "score": s.score, "factors": s.factors}
            log.info("PLACED %s %s entry=%.2f sl=%.2f tps=%s vol=%.2f legs=%s score=%d", gid,
                     "LONG" if s.direction == 1 else "SHORT", s.entry, s.sl, [round(x, 2) for x in s.tps], vol, legs,
                     s.score)
            self.journal.write("placed", group=gid, volume=vol, legs=legs, setup=s.to_dict())
