"""Market-structure scanner: liquidity sweep -> break of structure -> order block.

One causal pass over the bars. Everything decided at bar i uses only bars <= i:
swing points are confirmed ``swing_len`` bars after they print, and a setup is
emitted at the close of the BOS candle with its limit entry resting in the OB.

Shorts are found by running the *same* long scanner on a price-mirrored series
(high' = -low, low' = -high ...), which guarantees perfectly symmetric logic.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class RawSetup:
    bar: int            # index of the signal (BOS) bar; order is live from bar + 1
    entry: float
    sl: float
    sweep_bar: int
    sweep_extreme: float
    bos_level: float
    ob_high: float
    ob_low: float
    impulse_extreme: float
    has_fvg: bool


def scan_long(o: np.ndarray, h: np.ndarray, l: np.ndarray, c: np.ndarray, atr: np.ndarray, *,
              swing_len: int, sweep_lookback: int, bos_window: int, displacement_atr: float,
              ob_entry: str, sl_atr_buffer: float, min_sl_atr: float, max_sl_atr: float,
              reclaim_bars: int = 2) -> list[RawSetup]:
    n = len(c)
    L = swing_len
    lows: list[tuple[float, int]] = []    # unswept confirmed swing lows (price, idx)
    last_sh: tuple[float, int] | None = None  # most recent confirmed swing high
    cand = None    # pending sweep candidate: [level, extreme, start, bos_level]
    active = None  # confirmed sweep waiting for BOS: [extreme, sweep_bar, bos_level]
    out: list[RawSetup] = []

    for i in range(n):
        a = atr[i]
        if not np.isfinite(a) or a <= 0:
            continue
        # ---- 1. active sweep: invalidate / expire / BOS ----
        if active is not None:
            ext, sb, bos = active
            if l[i] < ext:
                active = None
            elif i - sb > bos_window:
                active = None
            elif c[i] > bos and c[i] - o[i] >= displacement_atr * a:
                # order block = last down-close candle between sweep and BOS
                k = i - 1
                while k >= sb and c[k] >= o[k]:
                    k -= 1
                if k < sb:
                    k = sb
                ob_hi, ob_lo = h[k], l[k]
                entry = ob_hi if ob_entry == "proximal" else (ob_hi + ob_lo) / 2.0
                sl = min(ob_lo, ext) - sl_atr_buffer * a
                risk = entry - sl
                fvg = any(l[j + 1] > h[j - 1] for j in range(max(sb, 1), i))
                if entry < c[i] and min_sl_atr * a <= risk <= max_sl_atr * a:
                    out.append(RawSetup(i, entry, sl, sb, ext, bos, ob_hi, ob_lo,
                                        float(h[sb:i + 1].max()), bool(fvg)))
                active = None

        # ---- 2. sweep detection (wick through a swing low, close back above) ----
        if cand is not None:
            cand[1] = min(cand[1], l[i])
            if c[i] > cand[0]:
                if cand[3] is not None:
                    active = [cand[1], i, cand[3]]
                cand = None
            elif i - cand[2] >= reclaim_bars:
                cand = None
        if cand is None:
            lows = [(p, j) for (p, j) in lows if i - j <= sweep_lookback]
            broken = [p for (p, j) in lows if l[i] < p]
            if broken:
                level = min(broken)
                lows = [(p, j) for (p, j) in lows if l[i] >= p]  # liquidity consumed
                bos = last_sh[0] if last_sh is not None else None
                if c[i] > level:
                    if bos is not None:
                        active = [l[i], i, bos]
                else:
                    cand = [level, l[i], i, bos]

        # ---- 3. confirm swing at j = i - L (known only now) ----
        j = i - L
        if j - L >= 0:
            if h[j] > h[j - L:j].max() and h[j] >= h[j + 1:i + 1].max():
                last_sh = (h[j], j)
            if l[j] < l[j - L:j].min() and l[j] <= l[j + 1:i + 1].min():
                lows.append((l[j], j))
    return out


def scan(o, h, l, c, atr, **kw) -> tuple[list[RawSetup], list[RawSetup]]:
    """Return (long_setups, short_setups). Short prices are mapped back to real prices."""
    longs = scan_long(o, h, l, c, atr, **kw)
    mirrored = scan_long(-o, -l, -h, -c, atr, **kw)
    shorts = [RawSetup(s.bar, -s.entry, -s.sl, s.sweep_bar, -s.sweep_extreme, -s.bos_level,
                       -s.ob_low, -s.ob_high, -s.impulse_extreme, s.has_fvg) for s in mirrored]
    return longs, shorts
