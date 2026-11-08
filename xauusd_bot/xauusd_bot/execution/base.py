"""Broker abstraction. A trade is a *group* of legs (one per TP tier); every leg is a
separate broker order/position carrying the SAME hard stop and its OWN take-profit,
so the protective orders live on the broker server even if the bot dies."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd


@dataclass
class SymbolSpec:
    contract_size: float
    volume_min: float
    volume_step: float
    volume_max: float
    tick_size: float
    stops_level: float = 0.0   # min distance of SL/TP from price, in price units


@dataclass
class BrokerPosition:
    ticket: int
    group: str
    direction: int
    volume: float
    price_open: float
    sl: float
    tp: float


@dataclass
class BrokerOrder:
    ticket: int
    group: str
    direction: int
    volume: float
    price: float
    sl: float
    tp: float


class Broker(ABC):
    @abstractmethod
    def connect(self) -> None: ...

    def shutdown(self) -> None:  # noqa: B027
        pass

    @abstractmethod
    def bars(self, n: int) -> pd.DataFrame:
        """Last ``n`` CLOSED LTF bars, UTC open-time index, bid OHLCV."""

    @abstractmethod
    def now(self) -> pd.Timestamp: ...

    @abstractmethod
    def spec(self) -> SymbolSpec: ...

    @abstractmethod
    def spread(self) -> float: ...

    @abstractmethod
    def equity(self) -> float: ...

    @abstractmethod
    def balance(self) -> float: ...

    @abstractmethod
    def place_limit_group(self, group: str, direction: int, entry: float, sl: float,
                          legs: list[tuple[float, float]], expiry: pd.Timestamp) -> list[int]: ...

    @abstractmethod
    def orders(self) -> list[BrokerOrder]: ...

    @abstractmethod
    def positions(self) -> list[BrokerPosition]: ...

    @abstractmethod
    def modify_sl(self, ticket: int, sl: float) -> bool: ...

    @abstractmethod
    def cancel(self, ticket: int) -> bool: ...

    @abstractmethod
    def close(self, ticket: int) -> bool: ...

    @abstractmethod
    def realized_pnl(self, tickets: list[int]) -> float:
        """Net P&L (incl. commission/swap) of closed positions opened by these order tickets."""

    def flatten(self) -> None:
        for o in self.orders():
            self.cancel(o.ticket)
        for p in self.positions():
            self.close(p.ticket)
