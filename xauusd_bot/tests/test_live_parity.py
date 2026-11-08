"""The live loop (via the paper broker) must place exactly the orders the backtest would."""
import json
from pathlib import Path

import pytest

from xauusd_bot.execution.paper import PaperBroker
from xauusd_bot.live import LiveTrader
from xauusd_bot.strategy import generate_setups


@pytest.mark.parametrize("start,stop", [(20_150, 20_260), (21_430, 21_520)])   # windows with known setups
def test_live_places_same_setups_as_backtest(df, cfg, tmp_path, start, stop):
    cfg.log_dir = str(tmp_path)
    cfg.live.state_dir = str(tmp_path / "state")
    cfg.live.history_bars = 12_000
    cfg.risk.max_trades_per_day = 99
    cfg.risk.max_open_trades = 99
    cfg.risk.max_consecutive_losses = 99
    sub = df.iloc[:stop]
    broker = PaperBroker(sub, cfg.instrument, 10_000, start_bar=start)
    trader = LiveTrader(cfg, broker)
    trader.start()
    while broker.advance():
        trader.poll()
    placed = [json.loads(x) for x in Path(tmp_path, "journal.jsonl").read_text().splitlines()]
    live_entries = sorted((round(e["setup"]["entry"], 4), e["setup"]["direction"]) for e in placed
                          if e["event"] in ("placed", "skip") and e.get("reason") != "spread")
    bt = [s for s in generate_setups(sub, cfg) if start <= s.bar < len(sub)]
    bt_entries = sorted((round(s.entry, 4), s.direction) for s in bt)
    assert live_entries == bt_entries
    assert len(bt_entries) > 0
