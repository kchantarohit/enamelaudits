"""Data acquisition and timeframe handling.

Convention used everywhere: the index is the bar OPEN time in UTC, columns are
open/high/low/close/volume. A bar opened at t on timeframe tf is only *known*
at t + tf, which ``align_htf`` respects so higher-timeframe data never leaks
into lower-timeframe decisions early.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

OHLCV = ["open", "high", "low", "close", "volume"]

_ALIASES = {
    "time": "time", "date": "time", "datetime": "time", "timestamp": "time", "gmt time": "time",
    "open": "open", "high": "high", "low": "low", "close": "close",
    "volume": "volume", "tick_volume": "volume", "tickvol": "volume", "vol": "real_volume", "real_volume": "real_volume",
}


def to_timedelta(tf: str) -> pd.Timedelta:
    return pd.Timedelta(pd.tseries.frequencies.to_offset(tf))


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Sort, dedupe, drop impossible bars, enforce OHLC consistency."""
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df.dropna(subset=["open", "high", "low", "close"])
    df = df[(df[["open", "high", "low", "close"]] > 0).all(axis=1)]
    df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
    df["low"] = df[["open", "high", "low", "close"]].min(axis=1)
    if "volume" not in df:
        df["volume"] = 1.0
    if "real_volume" in df and df["volume"].sum() == 0:
        df["volume"] = df["real_volume"]
    df["volume"] = df["volume"].fillna(0).clip(lower=0)
    return df[OHLCV].astype(float)


def load_csv(path: str | Path, tz: str = "UTC") -> pd.DataFrame:
    """Load MT5 / Dukascopy / generic CSV exports. Auto-detects separators and headers."""
    raw = pd.read_csv(path, sep=None, engine="python")
    cols = [c.strip().strip("<>").lower() for c in raw.columns]
    raw.columns = cols
    if "date" in cols and "time" in cols:          # MT5 export: <DATE> <TIME> columns
        raw["time"] = raw["date"].astype(str) + " " + raw["time"].astype(str)
        raw = raw.drop(columns=["date"])
    raw.columns = [_ALIASES.get(c, c) for c in raw.columns]
    if "time" not in raw.columns:
        raise ValueError(f"no time column in {path}: {list(raw.columns)}")
    if pd.api.types.is_numeric_dtype(raw["time"]):
        idx = pd.to_datetime(raw["time"], unit="s", utc=True)
    else:
        ts = raw["time"].astype(str).str.strip()
        ts = ts.str.replace(r"^(\d{4})\.(\d{2})\.(\d{2})", r"\1-\2-\3", regex=True)   # MT5 2024.01.02
        ts = ts.str.replace(r"^(\d{2})\.(\d{2})\.(\d{4})", r"\3-\2-\1", regex=True)   # Dukascopy 02.01.2024
        ts = ts.str.replace(r"\s*GMT[+-]?\d*$", "", regex=True)
        idx = pd.to_datetime(ts, format="mixed")
        idx = idx.dt.tz_localize(tz) if idx.dt.tz is None else idx
        idx = idx.dt.tz_convert("UTC")
    raw.index = pd.DatetimeIndex(idx, name="time")
    return clean(raw)


def load_mt5(symbol: str, timeframe: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Pull history from a running MetaTrader 5 terminal (Windows)."""
    import MetaTrader5 as mt5  # noqa: PLC0415  (optional dependency)

    tf_map = {"1min": mt5.TIMEFRAME_M1, "5min": mt5.TIMEFRAME_M5, "15min": mt5.TIMEFRAME_M15,
              "30min": mt5.TIMEFRAME_M30, "1h": mt5.TIMEFRAME_H1, "4h": mt5.TIMEFRAME_H4, "1D": mt5.TIMEFRAME_D1}
    if not mt5.initialize():
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
    rates = mt5.copy_rates_range(symbol, tf_map[timeframe], start.to_pydatetime(), end.to_pydatetime())
    if rates is None or len(rates) == 0:
        raise RuntimeError(f"no MT5 data: {mt5.last_error()}")
    df = pd.DataFrame(rates)
    df.index = pd.to_datetime(df["time"], unit="s", utc=True)
    df = df.rename(columns={"tick_volume": "volume"})
    return clean(df)


def load_yfinance(ticker: str = "GC=F", interval: str = "1h", period: str = "730d") -> pd.DataFrame:
    """Quick-experiment loader. GC=F is COMEX futures, NOT spot XAUUSD: use broker data for real tests."""
    import yfinance as yf  # noqa: PLC0415

    df = yf.download(ticker, interval=interval, period=period, auto_adjust=False, progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df.columns = [c.lower() for c in df.columns]
    df.index = pd.DatetimeIndex(df.index).tz_convert("UTC") if df.index.tz else pd.DatetimeIndex(df.index).tz_localize("UTC")
    return clean(df)


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    """Aggregate to a higher timeframe; bars labelled by open time; empty bars dropped."""
    out = df.resample(tf, label="left", closed="left").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
    return out.dropna(subset=["open"])


def align_htf(htf: pd.DataFrame, ltf_index: pd.DatetimeIndex, htf_tf: str, ltf_tf: str) -> pd.DataFrame:
    """Map HTF columns onto LTF bars using only HTF bars CLOSED by each LTF bar's close.

    HTF bar open t is complete at t+htf. LTF bar open s is decided at s+ltf.
    Value for LTF bar s = last HTF row with t+htf <= s+ltf.
    """
    shifted = htf.copy()
    shifted.index = htf.index + to_timedelta(htf_tf)
    ltf_close = ltf_index + to_timedelta(ltf_tf)
    aligned = shifted.reindex(shifted.index.union(ltf_close)).ffill().reindex(ltf_close)
    aligned.index = ltf_index
    return aligned


def check_gaps(df: pd.DataFrame, tf: str, max_gap: str = "3D") -> pd.DataFrame:
    """Report gaps longer than ``max_gap`` (weekends are ~2 days; anything bigger is suspicious)."""
    d = df.index.to_series().diff()
    gaps = d[d > pd.Timedelta(max_gap)]
    return pd.DataFrame({"gap_start": gaps.index - gaps.values, "gap_end": gaps.index, "length": gaps.values})
