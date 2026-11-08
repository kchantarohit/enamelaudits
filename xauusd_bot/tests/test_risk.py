import pandas as pd
import pytest

from xauusd_bot.config import BotConfig, InstrumentConfig, RiskConfig
from xauusd_bot.risk import RiskGuard, position_size, split_legs


@pytest.mark.parametrize("dist", [1.5, 4.0, 9.3, 22.0])
@pytest.mark.parametrize("bal", [2_000, 10_000, 250_000])
def test_size_never_exceeds_risk_budget(dist, bal):
    inst = InstrumentConfig()
    lots = position_size(bal, 0.01, 2000.0, 2000.0 - dist, inst)
    if lots == 0:
        return
    loss = (dist + inst.spread + inst.slippage) * lots * inst.contract_size + inst.commission_per_lot * lots
    assert loss <= 0.01 * bal + 1e-6
    # and it's not wildly under-sized (within one volume step)
    bigger = lots + inst.volume_step
    loss2 = (dist + inst.spread + inst.slippage) * bigger * inst.contract_size + inst.commission_per_lot * bigger
    assert loss2 > 0.01 * bal or bigger > inst.volume_max


def test_size_zero_when_min_lot_too_big():
    assert position_size(500, 0.01, 2000, 1980, InstrumentConfig()) == 0.0


@pytest.mark.parametrize("total", [0.01, 0.02, 0.03, 0.07, 0.1, 1.23])
def test_split_legs(total):
    inst = InstrumentConfig()
    legs = split_legs(total, [0.4, 0.3, 0.3], inst)
    assert abs(sum(legs) - total) < 1e-9
    assert all(v >= inst.volume_min - 1e-9 for v in legs)
    assert 1 <= len(legs) <= 3


def test_daily_drawdown_breaker_and_reset():
    g = RiskGuard(RiskConfig(daily_dd_limit=0.03))
    t0 = pd.Timestamp("2024-03-04 08:00", tz="UTC")
    g.on_time(t0, 10_000)
    assert g.check_equity(t0, 9_800) is None
    assert g.check_equity(t0, 9_699) == "flatten"
    ok, why = g.can_open(9_699, 50, 0)
    assert not ok and why == "daily_halt"
    g.on_time(t0 + pd.Timedelta("1D"), 9_699)        # next day: trading resumes
    assert g.can_open(9_699, 50, 0)[0]


def test_risk_budget_blocks_trade_that_could_breach_day_limit():
    g = RiskGuard(RiskConfig(daily_dd_limit=0.03))
    t0 = pd.Timestamp("2024-03-04 08:00", tz="UTC")
    g.on_time(t0, 10_000)
    ok, why = g.can_open(9_750, 100, 0)               # 9750 - 100 < 9700
    assert not ok and why == "daily_risk_budget"


def test_kill_switch():
    g = RiskGuard(RiskConfig(max_total_dd=0.10, daily_dd_limit=0.05))
    t = pd.Timestamp("2024-03-04", tz="UTC")
    g.on_time(t, 10_000)
    g.check_equity(t, 12_000)
    for k in range(1, 6):
        g.on_time(t + pd.Timedelta(days=k), 12_000 - 300 * k)
        g.check_equity(t + pd.Timedelta(days=k), 12_000 - 300 * k)
    assert g.killed and not g.can_open(10_000, 10, 0)[0]


def test_config_rejects_unsafe_values():
    with pytest.raises(ValueError):
        BotConfig().with_overrides({"risk.risk_per_trade": 0.05})
    with pytest.raises(ValueError):
        BotConfig().with_overrides({"management.tp_r": [1.5, 3.0, 5.0]})
