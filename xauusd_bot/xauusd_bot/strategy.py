"""Multi-timeframe confluence strategy.

Mandatory gates (all must pass):
  * HTF bias  : closed-HTF close and fast EMA on the right side of slow EMA
  * Structure : liquidity sweep -> displacement BOS -> order-block limit entry
  * Session   : setup prints inside a London / New York window, not late Friday
  * Volatility: LTF ATR percentile inside [atr_pct_min, atr_pct_max]
  * Room      : opposing liquidity at least ``require_room_rr`` R away
Optional confluence (need ``min_confluence`` of 5):
  rsi_exhaustion, fvg, discount, volume_profile, ltf_trend
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from .config import BotConfig
from .data.loaders import align_htf, resample
from .indicators import atr, ema, rolling_pct_rank, rsi, volume_profile
from .structure import scan

FACTORS = ("rsi_exhaustion", "fvg", "discount", "volume_profile", "ltf_trend")


@dataclass
class Setup:
    time: pd.Timestamp         # signal bar open time (decided at its close)
    bar: int
    direction: int             # +1 long, -1 short
    entry: float
    sl: float
    risk: float                # price distance entry -> SL
    tps: list
    expiry_bar: int
    score: int
    factors: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def compute_features(df: pd.DataFrame, cfg: BotConfig, htf: pd.DataFrame | None = None) -> pd.DataFrame:
    s, tf = cfg.strategy, cfg.timeframes
    f = df.copy()
    f["atr"] = atr(df, s.atr_len)
    f["rsi"] = rsi(df["close"], s.rsi_len)
    f["ema_f"] = ema(df["close"], s.ema_fast)
    f["ema_s"] = ema(df["close"], s.ema_slow)
    f["atr_pct"] = rolling_pct_rank(f["atr"], s.atr_pct_window)
    f = f.join(volume_profile(df, s.vp_window, s.vp_bins, s.vp_value_area))
    f["room_hi"] = df["high"].rolling(s.room_lookback, min_periods=1).max()
    f["room_lo"] = df["low"].rolling(s.room_lookback, min_periods=1).min()

    h = htf if htf is not None else resample(df, tf.htf)
    hf = pd.DataFrame(index=h.index)
    hf["h_close"] = h["close"]
    hf["h_ema_f"] = ema(h["close"], s.htf_ema_fast)
    hf["h_ema_s"] = ema(h["close"], s.htf_ema_slow)
    hal = align_htf(hf, df.index, tf.htf, tf.ltf)
    bull = (hal["h_close"] > hal["h_ema_s"]) & (hal["h_ema_f"] > hal["h_ema_s"])
    bear = (hal["h_close"] < hal["h_ema_s"]) & (hal["h_ema_f"] < hal["h_ema_s"])
    f["htf_bias"] = np.where(bull, 1, np.where(bear, -1, 0))

    hour, dow = df.index.hour, df.index.dayofweek
    in_sess = np.zeros(len(df), bool)
    for a, b in s.sessions:
        in_sess |= (hour >= a) & (hour < b)
    in_sess &= ~((dow == 4) & (hour >= s.friday_cutoff_hour))
    f["in_session"] = in_sess
    return f


def generate_setups(df: pd.DataFrame, cfg: BotConfig, features: pd.DataFrame | None = None,
                    htf: pd.DataFrame | None = None) -> list[Setup]:
    s, m = cfg.strategy, cfg.management
    f = features if features is not None else compute_features(df, cfg, htf)
    o, hi, lo, c = (f[k].to_numpy() for k in ("open", "high", "low", "close"))
    a = f["atr"].to_numpy()
    longs, shorts = scan(o, hi, lo, c, a, swing_len=s.swing_len, sweep_lookback=s.sweep_lookback,
                         bos_window=s.bos_window, displacement_atr=s.displacement_atr, ob_entry=s.ob_entry,
                         sl_atr_buffer=s.sl_atr_buffer, min_sl_atr=s.min_sl_atr, max_sl_atr=s.max_sl_atr)
    bias = f["htf_bias"].to_numpy()
    sess = f["in_session"].to_numpy()
    apct = f["atr_pct"].to_numpy()
    r = f["rsi"].to_numpy()
    ef, es = f["ema_f"].to_numpy(), f["ema_s"].to_numpy()
    poc, val, vah = f["poc"].to_numpy(), f["val"].to_numpy(), f["vah"].to_numpy()
    room_hi, room_lo = f["room_hi"].to_numpy(), f["room_lo"].to_numpy()
    idx = f.index

    out: list[Setup] = []
    for d, raws in ((1, longs), (-1, shorts)):
        for rs in raws:
            i = rs.bar
            risk = abs(rs.entry - rs.sl)
            if risk <= 0 or bias[i] != d or not sess[i]:
                continue
            if not (np.isfinite(apct[i]) and s.atr_pct_min <= apct[i] <= s.atr_pct_max):
                continue
            room = (room_hi[i] - rs.entry) if d == 1 else (rs.entry - room_lo[i])
            if s.require_room_rr > 0 and room < s.require_room_rr * risk:
                continue
            sweep_rsi = r[rs.sweep_bar]
            mid = (rs.sweep_extreme + rs.impulse_extreme) / 2.0
            prox = s.vp_proximity_atr * a[i]
            if d == 1:
                vp_ok = np.isfinite(poc[i]) and (abs(rs.entry - poc[i]) <= prox or abs(rs.entry - val[i]) <= prox
                                                  or rs.entry < val[i])
                facts = {"rsi_exhaustion": bool(sweep_rsi <= s.rsi_sweep_long_max),
                         "fvg": rs.has_fvg, "discount": bool(rs.entry <= mid),
                         "volume_profile": bool(vp_ok), "ltf_trend": bool(ef[i] > es[i])}
            else:
                vp_ok = np.isfinite(poc[i]) and (abs(rs.entry - poc[i]) <= prox or abs(rs.entry - vah[i]) <= prox
                                                  or rs.entry > vah[i])
                facts = {"rsi_exhaustion": bool(sweep_rsi >= 100 - s.rsi_sweep_long_max),
                         "fvg": rs.has_fvg, "discount": bool(rs.entry >= mid),
                         "volume_profile": bool(vp_ok), "ltf_trend": bool(ef[i] < es[i])}
            score = sum(facts.values())
            if score < s.min_confluence:
                continue
            tps = [rs.entry + d * k * risk for k in m.tp_r]
            out.append(Setup(idx[i], i, d, float(rs.entry), float(rs.sl), float(risk), [float(t) for t in tps],
                             i + s.order_expiry_bars, int(score), facts))
    out.sort(key=lambda x: (x.bar, -x.score))
    return out
