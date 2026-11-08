"""Causal indicators. Value at row i uses only rows <= i (i.e. known at bar i close)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100.0).where(up.notna())


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    pc = df["close"].shift()
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def rolling_pct_rank(s: pd.Series, window: int) -> pd.Series:
    """Percentile of the current value within the trailing window (0..1)."""
    return s.rolling(window, min_periods=max(20, window // 4)).rank(pct=True)


def volume_profile(df: pd.DataFrame, window: int = 480, bins: int = 40, value_area: float = 0.70,
                   refresh: str = "4h") -> pd.DataFrame:
    """Rolling volume profile -> POC, VAL, VAH.

    Each bar's volume is spread uniformly over the bins its high-low range covers.
    Recomputed on the first bar of each ``refresh`` clock period (anchored to wall
    time so live and backtest agree) from data ending at that bar, then held
    forward, so values are always causal.
    """
    h, l, v = df["high"].values, df["low"].values, df["volume"].values
    n = len(df)
    keys = df.index.floor(refresh).asi8
    poc = np.full(n, np.nan)
    val = np.full(n, np.nan)
    vah = np.full(n, np.nan)
    last = (np.nan, np.nan, np.nan)
    for i in range(n):
        if i >= window - 1 and (i == window - 1 or keys[i] != keys[i - 1]):
            hs, ls, vs = h[i - window + 1:i + 1], l[i - window + 1:i + 1], v[i - window + 1:i + 1]
            lo, hi = ls.min(), hs.max()
            if hi > lo:
                edges = np.linspace(lo, hi, bins + 1)
                width = edges[1] - edges[0]
                b_lo = np.clip(((ls - lo) / width).astype(int), 0, bins - 1)
                b_hi = np.clip(((hs - lo) / width).astype(int), 0, bins - 1)
                cnt = b_hi - b_lo + 1
                per = vs / cnt
                diff = np.zeros(bins + 1)
                np.add.at(diff, b_lo, per)
                np.add.at(diff, b_hi + 1, -per)
                hist = np.cumsum(diff)[:bins]
                p = int(np.argmax(hist))
                # expand value area around POC
                total, acc, a, b = hist.sum(), hist[p], p, p
                while acc < value_area * total and (a > 0 or b < bins - 1):
                    left = hist[a - 1] if a > 0 else -1
                    right = hist[b + 1] if b < bins - 1 else -1
                    if right >= left:
                        b += 1
                        acc += hist[b]
                    else:
                        a -= 1
                        acc += hist[a]
                centers = edges[:-1] + width / 2
                last = (centers[p], edges[a], edges[b + 1])
        poc[i], val[i], vah[i] = last
    return pd.DataFrame({"poc": poc, "val": val, "vah": vah}, index=df.index)
