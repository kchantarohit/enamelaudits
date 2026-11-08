"""Synthetic gold-like M15 data for plumbing tests ONLY.

It has gold-ish properties (price level, session volatility seasonality, volatility
clustering, regime drift, weekend gaps) but NO genuine edge. A strategy that looks
great on this data is overfit or leaking information -- that is exactly what it
is useful for detecting.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def generate(start: str = "2021-01-04", end: str = "2025-12-31", tf: str = "15min",
             s0: float = 1850.0, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, end, freq=tf, tz="UTC", inclusive="left")
    # Gold trades ~Sun 22:00 -> Fri 21:00 UTC with a daily break 21:00-22:00
    dow, hour = idx.dayofweek, idx.hour
    open_mask = ~((dow == 5) | ((dow == 4) & (hour >= 21)) | ((dow == 6) & (hour < 22)) | (hour == 21))
    idx = idx[open_mask]
    n = len(idx)

    hour = idx.hour.values
    session_vol = np.select([(hour >= 7) & (hour < 11), (hour >= 12) & (hour < 17), (hour >= 22) | (hour < 2)],
                            [1.4, 1.8, 0.7], 0.9)
    # GARCH(1,1)-style clustering on a per-bar basis
    base = 0.0007
    omega, alpha, beta = base**2 * 0.04, 0.06, 0.90
    var = np.empty(n)
    ret = np.empty(n)
    var[0] = base**2
    z = rng.standard_t(df=5, size=n) / np.sqrt(5 / 3)
    # mean-reverting (OU) drift: trends that last weeks, ~±20%/yr, then fade
    shocks = rng.normal(0, 4e-7, n)
    drift = np.empty(n)
    drift[0] = 0.0
    for i in range(1, n):
        drift[i] = 0.999 * drift[i - 1] + shocks[i]
    eps = np.empty(n)
    for i in range(n):
        if i:
            var[i] = omega + alpha * eps[i - 1] ** 2 + beta * var[i - 1]
        eps[i] = np.sqrt(var[i]) * z[i]
    ret = drift + eps * session_vol
    close = s0 * np.exp(np.cumsum(ret))
    open_ = np.empty(n)
    open_[0] = s0
    open_[1:] = close[:-1]
    # weekend gaps
    gap = np.r_[False, np.diff(idx.asi8) > pd.Timedelta("1D").value]
    open_[gap] = close[np.where(gap)[0] - 1] * np.exp(rng.normal(0, 0.004, gap.sum()))
    body_hi = np.maximum(open_, close)
    body_lo = np.minimum(open_, close)
    wick = np.abs(rng.normal(0, 1, (2, n))) * np.sqrt(var) * session_vol * close * 0.6
    high = body_hi + wick[0]
    low = body_lo - wick[1]
    volume = np.round(200 * session_vol * (1 + 40 * np.abs(ret)) * rng.lognormal(0, 0.3, n))
    df = pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume}, index=idx)
    df.index.name = "time"
    return df.round(2)
