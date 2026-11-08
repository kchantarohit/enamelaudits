"""Paper broker: replays historical bars one at a time so the *live* loop can be
exercised end-to-end offline (dry run). Fill rules mirror the backtester."""
from __future__ import annotations

import itertools

import pandas as pd

from ..config import InstrumentConfig
from .base import Broker, BrokerOrder, BrokerPosition, SymbolSpec


class PaperBroker(Broker):
    def __init__(self, data: pd.DataFrame, inst: InstrumentConfig, balance: float = 10_000.0, start_bar: int = 5000):
        self.data, self.inst = data, inst
        self.i = start_bar               # index of the bar currently FORMING (bars < i are closed)
        self._bal = balance
        self._orders: dict[int, dict] = {}
        self._pos: dict[int, dict] = {}
        self._closed: dict[int, float] = {}
        self._ids = itertools.count(1)

    # ---- clock ----
    def connect(self) -> None:
        pass

    def advance(self) -> bool:
        """Process the forming bar (fills/exits) then move to the next. False at end of data."""
        if self.i >= len(self.data):
            return False
        b = self.data.iloc[self.i]
        sp, slip = self.inst.spread, self.inst.slippage
        for t, p in list(self._pos.items()):
            d = p["direction"]
            if (d == 1 and b.low <= p["sl"]) or (d == -1 and b.high + sp >= p["sl"]):
                self._exit(t, p["sl"] - d * slip)
            elif (d == 1 and b.high >= p["tp"]) or (d == -1 and b.low + sp <= p["tp"]):
                self._exit(t, p["tp"])
        for t, o in list(self._orders.items()):
            d = o["direction"]
            if b.name >= o["expiry"]:
                del self._orders[t]
            elif (d == 1 and b.low + sp <= o["price"]) or (d == -1 and b.high >= o["price"]):
                fill = min(o["price"], b.open + sp) if d == 1 else max(o["price"], b.open)
                del self._orders[t]
                self._pos[t] = {**o, "price_open": fill}
                if (d == 1 and b.low <= o["sl"]) or (d == -1 and b.high + sp >= o["sl"]):
                    self._exit(t, o["sl"] - d * slip)
        self.i += 1
        return True

    def _exit(self, t: int, price: float) -> None:
        p = self._pos.pop(t)
        pnl = p["direction"] * (price - p["price_open"]) * p["volume"] * self.inst.contract_size \
            - self.inst.commission_per_lot * p["volume"]
        self._bal += pnl
        self._closed[t] = pnl

    def _mid_px(self) -> float:
        return float(self.data["close"].iloc[self.i - 1])

    # ---- Broker API ----
    def bars(self, n: int) -> pd.DataFrame:
        return self.data.iloc[max(0, self.i - n):self.i]

    def now(self) -> pd.Timestamp:
        return self.data.index[min(self.i, len(self.data) - 1)]

    def spec(self) -> SymbolSpec:
        x = self.inst
        return SymbolSpec(x.contract_size, x.volume_min, x.volume_step, x.volume_max, x.tick_size)

    def spread(self) -> float:
        return self.inst.spread

    def balance(self) -> float:
        return self._bal

    def equity(self) -> float:
        px = self._mid_px()
        u = sum(p["direction"] * ((px if p["direction"] == 1 else px + self.inst.spread) - p["price_open"])
                * p["volume"] * self.inst.contract_size for p in self._pos.values())
        return self._bal + u

    def place_limit_group(self, group, direction, entry, sl, legs, expiry):
        out = []
        for vol, tp in legs:
            t = next(self._ids)
            self._orders[t] = {"group": group, "direction": direction, "volume": vol, "price": entry, "sl": sl,
                               "tp": tp, "expiry": expiry}
            out.append(t)
        return out

    def orders(self):
        return [BrokerOrder(t, o["group"], o["direction"], o["volume"], o["price"], o["sl"], o["tp"])
                for t, o in self._orders.items()]

    def positions(self):
        return [BrokerPosition(t, p["group"], p["direction"], p["volume"], p["price_open"], p["sl"], p["tp"])
                for t, p in self._pos.items()]

    def modify_sl(self, ticket, sl):
        if ticket in self._pos:
            self._pos[ticket]["sl"] = sl
            return True
        return False

    def cancel(self, ticket):
        return self._orders.pop(ticket, None) is not None

    def close(self, ticket):
        if ticket not in self._pos:
            return False
        d = self._pos[ticket]["direction"]
        px = self._mid_px()
        self._exit(ticket, px - self.inst.slippage if d == 1 else px + self.inst.spread + self.inst.slippage)
        return True

    def realized_pnl(self, tickets):
        return float(sum(self._closed.get(t, 0.0) for t in tickets))
