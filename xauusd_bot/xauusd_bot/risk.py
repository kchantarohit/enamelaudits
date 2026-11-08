"""Position sizing and account-level circuit breakers (shared by backtest and live)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from .config import InstrumentConfig, RiskConfig


def round_down(x: float, step: float) -> float:
    return math.floor(x / step + 1e-9) * step


def position_size(balance: float, risk_frac: float, entry: float, sl: float, inst: InstrumentConfig) -> float:
    """Lots such that a hard-SL hit (incl. spread, slippage, commission) loses <= risk_frac * balance.

    Returns 0.0 if even the minimum lot would exceed the budget -> trade must be skipped.
    """
    dist = abs(entry - sl)
    if dist <= 0 or balance <= 0:
        return 0.0
    loss_per_lot = (dist + inst.spread + inst.slippage) * inst.contract_size + inst.commission_per_lot
    lots = round_down(risk_frac * balance / loss_per_lot, inst.volume_step)
    lots = min(lots, inst.volume_max)
    return round(lots, 8) if lots >= inst.volume_min else 0.0


def split_legs(total: float, weights: list[float], inst: InstrumentConfig) -> list[float]:
    """Split a position into TP tiers. Legs that would fall below the min lot are merged
    into the previous leg; the result always sums to ``total``. If fewer legs survive
    than tiers, the last legs are dropped (the runner tier goes first)."""
    step, vmin = inst.volume_step, inst.volume_min
    legs = [round_down(total * w, step) for w in weights]
    legs[0] = round(total - sum(legs[1:]), 8)            # rounding remainder to TP1
    while len(legs) > 1 and min(legs) < vmin - 1e-9:
        v = legs.pop()
        legs[-1] += v
    return [round(v, 8) for v in legs]


@dataclass
class RiskGuard:
    """Daily drawdown circuit breaker, consecutive-loss pause, total-DD kill switch."""

    cfg: RiskConfig
    day: pd.Timestamp | None = None
    day_start_equity: float = 0.0
    peak_equity: float = 0.0
    trades_today: int = 0
    consec_losses: int = 0
    halted_day: pd.Timestamp | None = None
    killed: bool = False
    events: list = field(default_factory=list)

    def _trading_day(self, t: pd.Timestamp) -> pd.Timestamp:
        return (t - pd.Timedelta(hours=self.cfg.day_reset_hour_utc)).normalize()

    def on_time(self, t: pd.Timestamp, equity: float) -> None:
        d = self._trading_day(t)
        if self.day is None or d != self.day:
            self.day = d
            self.day_start_equity = equity
            self.trades_today = 0
            self.consec_losses = 0 if self.halted_day != d else self.consec_losses
        self.peak_equity = max(self.peak_equity, equity)

    def check_equity(self, t: pd.Timestamp, equity: float) -> str | None:
        """Return 'flatten' if a breaker trips at this equity (caller closes everything)."""
        self.peak_equity = max(self.peak_equity, equity)
        if not self.killed and self.peak_equity > 0 and equity <= self.peak_equity * (1 - self.cfg.max_total_dd):
            self.killed = True
            self.events.append((t, "kill_switch", equity))
            return "flatten"
        if self.halted_day != self.day and equity <= self.day_start_equity * (1 - self.cfg.daily_dd_limit):
            self.halted_day = self.day
            self.events.append((t, "daily_dd_halt", equity))
            return "flatten"
        return None

    def can_open(self, equity: float, new_risk_cash: float, open_count: int) -> tuple[bool, str]:
        if self.killed:
            return False, "kill_switch"
        if self.halted_day == self.day:
            return False, "daily_halt"
        if self.trades_today >= self.cfg.max_trades_per_day:
            return False, "max_trades_per_day"
        if open_count >= self.cfg.max_open_trades:
            return False, "max_open_trades"
        if self.consec_losses >= self.cfg.max_consecutive_losses:
            return False, "consecutive_losses"
        # never let one more stop-out push the day beyond the limit
        floor = self.day_start_equity * (1 - self.cfg.daily_dd_limit)
        if equity - new_risk_cash < floor:
            return False, "daily_risk_budget"
        return True, "ok"

    def on_order_placed(self) -> None:
        self.trades_today += 1

    def on_trade_closed(self, pnl: float) -> None:
        self.consec_losses = self.consec_losses + 1 if pnl < 0 else 0

    # persistence for live trading
    def to_dict(self) -> dict:
        return {"day": str(self.day) if self.day is not None else None, "day_start_equity": self.day_start_equity,
                "peak_equity": self.peak_equity, "trades_today": self.trades_today,
                "consec_losses": self.consec_losses, "killed": self.killed,
                "halted_day": str(self.halted_day) if self.halted_day is not None else None}

    @classmethod
    def from_dict(cls, cfg: RiskConfig, d: dict) -> "RiskGuard":
        g = cls(cfg)
        g.day = pd.Timestamp(d["day"]) if d.get("day") else None
        g.halted_day = pd.Timestamp(d["halted_day"]) if d.get("halted_day") else None
        for k in ("day_start_equity", "peak_equity", "trades_today", "consec_losses", "killed"):
            setattr(g, k, d.get(k, getattr(g, k)))
        return g
