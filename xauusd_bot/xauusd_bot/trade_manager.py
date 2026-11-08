"""Stop management rules shared by the backtester and the live executor.

All rules only *tighten* the stop and are evaluated on a closed bar; the new stop
applies from the next bar (live: is sent to the broker right away).
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import ManagementConfig


@dataclass
class StopState:
    direction: int
    entry: float
    initial_sl: float
    stop: float
    tps: list
    best: float              # most favourable price seen since fill (high for long)
    tps_hit: int = 0
    be_done: bool = False

    @property
    def risk(self) -> float:
        return abs(self.entry - self.initial_sl)


def _tighter(d: int, cur: float, new: float) -> float:
    return max(cur, new) if d == 1 else min(cur, new)


def update_stop(st: StopState, bar_high: float, bar_low: float, atr: float, m: ManagementConfig) -> float:
    """Update ``st`` with a closed bar and return the new stop."""
    d = st.direction
    st.best = max(st.best, bar_high) if d == 1 else min(st.best, bar_low)
    fav_r = d * (st.best - st.entry) / st.risk
    if not st.be_done and fav_r >= m.breakeven_trigger_r:
        st.stop = _tighter(d, st.stop, st.entry + d * m.breakeven_offset_r * st.risk)
        st.be_done = True
    if st.tps_hit >= 1:
        st.stop = _tighter(d, st.stop, st.entry + d * m.breakeven_offset_r * st.risk)
    if st.tps_hit >= 2 and m.lock_tp1_after_tp2:
        st.stop = _tighter(d, st.stop, st.tps[0])
    if st.tps_hit >= 2 and m.trail_atr_mult > 0 and atr > 0:
        st.stop = _tighter(d, st.stop, st.best - d * m.trail_atr_mult * atr)
    return st.stop
