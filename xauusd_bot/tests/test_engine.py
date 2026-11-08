"""Engine mechanics on hand-built price paths with injected setups."""
import numpy as np
import pandas as pd
import pytest

from xauusd_bot.backtest.engine import Backtester
from xauusd_bot.backtest.validation import pbo_cscv
from xauusd_bot.strategy import Setup


def make(path, start="2024-03-05 08:00"):
    """path: list of (open, high, low, close) bid bars."""
    idx = pd.date_range(start, periods=len(path), freq="15min", tz="UTC")
    df = pd.DataFrame(path, columns=["open", "high", "low", "close"], index=idx)
    df["volume"] = 100.0
    f = df.copy()
    f["atr"] = 2.0
    return df, f


def long_setup(f, entry=2000.0, risk=5.0, bar=0):
    tps = [entry + k * risk for k in (2, 3, 5)]
    return Setup(f.index[bar], bar, 1, entry, entry - risk, risk, tps, bar + 16, 3, {})


def flat(px, n):
    return [(px, px + 0.5, px - 0.5, px)] * n


@pytest.fixture()
def bt(cfg):
    cfg.instrument.spread = 0.0
    cfg.instrument.slippage = 0.0
    cfg.instrument.commission_per_lot = 0.0
    return Backtester(cfg)


def test_stop_loss_is_minus_one_r(bt):
    path = flat(2003, 2) + [(2001, 2001, 1999.5, 2000)] + [(2000, 2000.5, 1994, 1995)] + flat(1995, 3)
    df, f = make(path)
    r = bt.run(df, features=f, setups=[long_setup(f)])
    t = r.trades.iloc[0]
    assert t.exit_reason == "sl" and t.r == pytest.approx(-1.0, abs=0.02)


def test_full_target_ladder(bt):
    up = [(2000 + 2 * k, 2000 + 2 * k + 2.2, 2000 + 2 * k - 0.2, 2000 + 2 * k + 2) for k in range(1, 20)]
    path = flat(2003, 2) + [(2001, 2001, 1999.8, 2001)] + up
    df, f = make(path)
    r = bt.run(df, features=f, setups=[long_setup(f)])
    t = r.trades.iloc[0]
    # 40% @2R + 30% @3R + 30% @5R = 3.2R
    assert t.tps_hit == 3 and t.r == pytest.approx(0.4 * 2 + 0.3 * 3 + 0.3 * 5, abs=0.05)


def test_breakeven_after_1r(bt):
    path = (flat(2003, 2) + [(2001, 2001, 1999.8, 2001)] + [(2001, 2005.5, 2000.5, 2005)]
            + [(2005, 2005.2, 1990, 1991)] + flat(1991, 3))
    df, f = make(path)
    r = bt.run(df, features=f, setups=[long_setup(f)])
    t = r.trades.iloc[0]
    assert t.exit_reason == "be" and t.r == pytest.approx(0.05, abs=0.02)


def test_conservative_same_bar_stop_wins(bt):
    path = flat(2003, 2) + [(2001, 2001, 1999.8, 2001)] + [(2001, 2011, 1994, 2005)] + flat(2005, 3)
    df, f = make(path)
    r = bt.run(df, features=f, setups=[long_setup(f)])
    assert r.trades.iloc[0].exit_reason == "sl"


def test_order_expires_unfilled(bt):
    df, f = make(flat(2010, 40))
    r = bt.run(df, features=f, setups=[long_setup(f)])
    assert r.trades.empty


def test_costs_make_stop_worse_than_minus_one(cfg):
    path = flat(2003, 2) + [(2001, 2001, 1999.5, 2000)] + [(2000, 2000.5, 1994, 1995)] + flat(1995, 3)
    df, f = make(path)
    r = Backtester(cfg).run(df, features=f, setups=[long_setup(f)])
    assert r.trades.iloc[0].r < -1.0


def test_pbo_detects_noise_and_skill():
    rng = np.random.default_rng(0)
    noise = rng.normal(size=(30, 8))
    assert 0.25 < pbo_cscv(noise) < 0.8
    skill = noise.copy()
    skill[7] += 3.0
    assert pbo_cscv(skill) < 0.05
