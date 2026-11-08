"""The single most important test: decisions at time t must not change when future
bars are appended. If this fails, every backtest number is fiction."""
import numpy as np
import pandas as pd

from xauusd_bot.data.loaders import align_htf, resample
from xauusd_bot.strategy import compute_features, generate_setups
from xauusd_bot.structure import scan, scan_long

COLS = ["atr", "rsi", "ema_f", "ema_s", "atr_pct", "poc", "val", "vah", "htf_bias", "room_hi", "room_lo"]


def test_features_are_causal(df, cfg):
    full = compute_features(df, cfg)
    for cut in (20_000, 31_337):
        part = compute_features(df.iloc[:cut], cfg)
        a, b = full.iloc[:cut][COLS], part[COLS]
        pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-9)


def test_setups_are_causal(df, cfg):
    full = generate_setups(df, cfg)
    cut = 30_000
    part = generate_setups(df.iloc[:cut], cfg)
    key = lambda s: (s.bar, s.direction, round(s.entry, 6), round(s.sl, 6))  # noqa: E731
    assert [key(s) for s in full if s.bar < cut] == [key(s) for s in part]
    assert len(part) > 0


def test_htf_alignment_uses_only_closed_bars(df, cfg):
    ltf = df.iloc[:2000]
    h4 = resample(ltf, "4h")
    al = align_htf(h4[["close"]], ltf.index, "4h", "15min")
    # the 15m bar opening 03:45 closes at 04:00 -> may see the 00:00 H4 bar (closed 04:00)
    day = ltf.index[ltf.index.hour == 3][0].normalize()
    t345, t330 = day + pd.Timedelta("3h45min"), day + pd.Timedelta("3h30min")
    assert al.loc[t345, "close"] == h4.loc[day, "close"]
    assert al.loc[t330, "close"] != h4.loc[day, "close"] or np.isnan(al.loc[t330, "close"]) or \
        al.loc[t330, "close"] == h4["close"].shift().loc[day]


def test_mirror_symmetry(df, cfg):
    s = cfg.strategy
    kw = dict(swing_len=s.swing_len, sweep_lookback=s.sweep_lookback, bos_window=s.bos_window,
              displacement_atr=s.displacement_atr, ob_entry=s.ob_entry, sl_atr_buffer=s.sl_atr_buffer,
              min_sl_atr=s.min_sl_atr, max_sl_atr=s.max_sl_atr)
    f = compute_features(df.iloc[:15000], cfg)
    o, h, l, c, a = (f[k].to_numpy() for k in ("open", "high", "low", "close", "atr"))
    longs = scan_long(o, h, l, c, a, **kw)
    # mirror prices around K (p -> K - p, high <-> low): every long of the original
    # must reappear as a short of the mirrored series at the mirrored price
    K = 2 * c.max()
    _, shorts = scan(K - o, K - l, K - h, K - c, a, **kw)
    assert len(longs) > 0
    assert [x.bar for x in longs] == [x.bar for x in shorts]
    assert np.allclose([K - x.entry for x in longs], [x.entry for x in shorts])
    assert np.allclose([K - x.sl for x in longs], [x.sl for x in shorts])
