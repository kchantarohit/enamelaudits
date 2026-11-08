"""Typed configuration. Every tunable lives here so nothing is hard-coded in logic.

Load from YAML with ``load_config(path)``; unknown keys raise so typos never
silently fall back to defaults.
"""
from __future__ import annotations

import copy
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class InstrumentConfig:
    symbol: str = "XAUUSD"
    contract_size: float = 100.0      # oz per 1.00 lot -> $1 move = $100 per lot
    volume_min: float = 0.01
    volume_step: float = 0.01
    volume_max: float = 50.0
    tick_size: float = 0.01
    spread: float = 0.25              # price units (25 cents), applied to every entry/exit
    slippage: float = 0.05            # extra adverse fill on market/stop exits
    commission_per_lot: float = 7.0   # USD round-turn per 1.00 lot


@dataclass
class TimeframeConfig:
    ltf: str = "15min"   # execution / setup timeframe
    htf: str = "4h"      # bias timeframe (only *closed* HTF bars are used)


@dataclass
class StrategyConfig:
    # --- market structure ---
    swing_len: int = 3                 # fractal half-width; a swing is confirmed swing_len bars later
    sweep_lookback: int = 40           # bars a swing level stays "liquidity" eligible for a sweep
    bos_window: int = 12               # bars after the sweep in which a BOS must occur
    displacement_atr: float = 1.0      # BOS candle body >= this * ATR
    ob_entry: str = "proximal"         # proximal | mid  (where in the order block to rest the limit)
    order_expiry_bars: int = 16        # pending limit lifetime
    sl_atr_buffer: float = 0.25        # extra ATR beyond OB/sweep extreme
    min_sl_atr: float = 0.5
    max_sl_atr: float = 3.0
    # --- indicators ---
    atr_len: int = 14
    rsi_len: int = 14
    ema_fast: int = 50
    ema_slow: int = 200
    htf_ema_fast: int = 50
    htf_ema_slow: int = 200
    vp_window: int = 480               # bars in rolling volume profile (480 x 15m = 5 days)
    vp_bins: int = 40
    vp_value_area: float = 0.70
    atr_pct_window: int = 500
    atr_pct_min: float = 0.20          # skip dead markets
    atr_pct_max: float = 0.95          # skip news-spike chaos
    # --- confluence ---
    min_confluence: int = 3            # optional factors that must agree (out of 5)
    rsi_sweep_long_max: float = 45.0   # RSI at sweep must be <= this for longs (mirror for shorts)
    vp_proximity_atr: float = 1.0      # entry within this many ATR of POC/VAL/VAH counts
    require_room_rr: float = 2.0       # opposing liquidity must be >= this many R away
    room_lookback: int = 480
    # --- sessions (UTC hours, [start, end)) ---
    sessions: list = field(default_factory=lambda: [[7, 11], [12, 16]])
    friday_cutoff_hour: int = 18       # no new setups after this hour on Friday (UTC)


@dataclass
class ManagementConfig:
    # Tier weights must sum to 1. Each tier is a separate leg with its own server-side TP.
    tp_r: list = field(default_factory=lambda: [2.0, 3.0, 5.0])
    tp_weights: list = field(default_factory=lambda: [0.4, 0.3, 0.3])
    breakeven_trigger_r: float = 1.0   # move SL to BE once price reaches this R
    breakeven_offset_r: float = 0.05   # lock this much R (covers spread/commission)
    lock_tp1_after_tp2: bool = True    # after TP2, runner SL -> TP1 level
    trail_atr_mult: float = 2.5        # chandelier trail for the runner after TP2 (0 = off)
    max_hold_bars: int = 192           # time stop (192 x 15m = 2 days)
    close_before_weekend: bool = True
    weekend_close_hour: int = 20       # Friday UTC


@dataclass
class RiskConfig:
    risk_per_trade: float = 0.01       # fraction of balance risked at the hard SL
    max_risk_per_trade: float = 0.02   # absolute cap, validated
    daily_dd_limit: float = 0.03       # circuit breaker on equity vs. day-start equity
    max_total_dd: float = 0.15         # kill switch on equity vs. peak
    max_trades_per_day: int = 3
    max_open_trades: int = 1
    max_consecutive_losses: int = 4    # pause for rest of day after this many
    day_reset_hour_utc: int = 0


@dataclass
class BacktestConfig:
    initial_balance: float = 10_000.0
    conservative_intrabar: bool = True  # SL assumed hit before TP when both inside one bar


@dataclass
class WalkForwardConfig:
    is_months: int = 12
    oos_months: int = 3
    step_months: int = 3
    min_trades_is: int = 8              # strict filters trade ~1-2x/month: keep this realistic
    objective: str = "expectancy_r"     # expectancy_r | profit_factor | sharpe | net_r
    robust_neighbourhood: bool = True   # score = mean of params' grid neighbourhood
    grid: dict = field(default_factory=lambda: {
        "strategy.displacement_atr": [0.8, 1.0, 1.3],
        "strategy.min_confluence": [2, 3, 4],
        "management.breakeven_trigger_r": [1.0, 1.5],
    })
    cv_folds: int = 8
    cv_embargo_days: int = 5


@dataclass
class LiveConfig:
    broker: str = "paper"               # paper | mt5
    magic: int = 240_611
    poll_seconds: int = 5
    history_bars: int = 3000
    max_spread: float = 0.60            # skip entries if live spread wider (price units)
    state_dir: str = "state"
    mt5_login: int | None = None
    mt5_password: str | None = None     # prefer env var MT5_PASSWORD
    mt5_server: str | None = None
    mt5_path: str | None = None


@dataclass
class BotConfig:
    instrument: InstrumentConfig = field(default_factory=InstrumentConfig)
    timeframes: TimeframeConfig = field(default_factory=TimeframeConfig)
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    management: ManagementConfig = field(default_factory=ManagementConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    backtest: BacktestConfig = field(default_factory=BacktestConfig)
    walkforward: WalkForwardConfig = field(default_factory=WalkForwardConfig)
    live: LiveConfig = field(default_factory=LiveConfig)
    log_dir: str = "logs"

    def validate(self) -> "BotConfig":
        r, m = self.risk, self.management
        if not 0 < r.risk_per_trade <= r.max_risk_per_trade <= 0.02:
            raise ValueError("risk_per_trade must be in (0, max_risk_per_trade] and max <= 2%")
        if not 0 < r.daily_dd_limit <= 0.10:
            raise ValueError("daily_dd_limit must be in (0, 10%]")
        if len(m.tp_r) != len(m.tp_weights) or abs(sum(m.tp_weights) - 1) > 1e-9:
            raise ValueError("tp_r and tp_weights must align and weights sum to 1")
        if min(m.tp_r) < 2.0:
            raise ValueError("every take-profit tier must be >= 2R (minimum 1:2)")
        if sorted(m.tp_r) != list(m.tp_r):
            raise ValueError("tp_r must be ascending")
        if m.breakeven_trigger_r >= m.tp_r[0]:
            raise ValueError("breakeven trigger must be below TP1")
        if self.strategy.ob_entry not in ("proximal", "mid"):
            raise ValueError("ob_entry must be proximal|mid")
        return self

    def to_dict(self) -> dict:
        return asdict(self)

    def with_overrides(self, overrides: dict[str, Any]) -> "BotConfig":
        """Return a copy with dotted-key overrides, e.g. {'strategy.swing_len': 4}."""
        new = copy.deepcopy(self)
        for key, value in overrides.items():
            section, _, attr = key.rpartition(".")
            target = getattr(new, section) if section else new
            if not hasattr(target, attr):
                raise KeyError(f"unknown config key {key}")
            setattr(target, attr, value)
        return new.validate()


def _merge(dc: Any, data: dict, path: str = "") -> None:
    names = {f.name for f in fields(dc)}
    for k, v in data.items():
        if k not in names:
            raise KeyError(f"unknown config key '{path}{k}'")
        cur = getattr(dc, k)
        if is_dataclass(cur) and isinstance(v, dict):
            _merge(cur, v, f"{path}{k}.")
        else:
            setattr(dc, k, v)


def load_config(path: str | Path | None = None) -> BotConfig:
    cfg = BotConfig()
    if path:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        _merge(cfg, data)
    return cfg.validate()
