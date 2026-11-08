"""MetaTrader 5 broker adapter (requires Windows + ``pip install MetaTrader5`` + a running terminal).

Notes
-----
* MT5 bar times are broker *server* time (often UTC+2/UTC+3 with DST). The offset is
  auto-detected from the latest tick vs. the UTC clock and removed, so the strategy
  always works in UTC.
* Each TP tier is its own pending order with server-side SL and TP. A position opened
  by a pending order has ``identifier == order ticket``, which is how legs are tracked.
* Use a HEDGING account (or a netting account with ``max_open_trades = 1``).
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import pandas as pd

from ..config import BotConfig
from .base import Broker, BrokerOrder, BrokerPosition, SymbolSpec

log = logging.getLogger("mt5")

_TF = {"1min": "TIMEFRAME_M1", "5min": "TIMEFRAME_M5", "15min": "TIMEFRAME_M15", "30min": "TIMEFRAME_M30",
       "1h": "TIMEFRAME_H1", "4h": "TIMEFRAME_H4"}


class MT5Broker(Broker):
    def __init__(self, cfg: BotConfig):
        import MetaTrader5 as mt5  # noqa: PLC0415
        self.mt5 = mt5
        self.cfg = cfg
        self.symbol = cfg.instrument.symbol
        self.magic = cfg.live.magic
        self.offset = pd.Timedelta(0)

    # ---- session ----
    def connect(self) -> None:
        mt5, lv = self.mt5, self.cfg.live
        kw = {}
        if lv.mt5_path:
            kw["path"] = lv.mt5_path
        if lv.mt5_login:
            kw.update(login=int(lv.mt5_login), password=lv.mt5_password or os.environ.get("MT5_PASSWORD", ""),
                      server=lv.mt5_server)
        if not mt5.initialize(**kw):
            raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
        if not mt5.symbol_select(self.symbol, True):
            raise RuntimeError(f"symbol {self.symbol} unavailable")
        tick = mt5.symbol_info_tick(self.symbol)
        server_now = pd.Timestamp(tick.time, unit="s", tz="UTC")
        utc_now = pd.Timestamp(datetime.now(timezone.utc))
        self.offset = pd.Timedelta(hours=round((server_now - utc_now).total_seconds() / 3600))
        acc = mt5.account_info()
        log.info("MT5 connected: account=%s server=%s balance=%.2f server_offset=%s margin_mode=%s",
                 acc.login, acc.server, acc.balance, self.offset, acc.margin_mode)

    def shutdown(self) -> None:
        self.mt5.shutdown()

    def now(self) -> pd.Timestamp:
        return pd.Timestamp(datetime.now(timezone.utc))

    # ---- market data ----
    def bars(self, n: int) -> pd.DataFrame:
        mt5 = self.mt5
        tf = getattr(mt5, _TF[self.cfg.timeframes.ltf])
        rates = mt5.copy_rates_from_pos(self.symbol, tf, 1, n)   # pos 1 => skip the forming bar
        if rates is None:
            raise RuntimeError(f"copy_rates failed: {mt5.last_error()}")
        df = pd.DataFrame(rates)
        df.index = pd.to_datetime(df["time"], unit="s", utc=True) - self.offset
        df = df.rename(columns={"tick_volume": "volume"})[["open", "high", "low", "close", "volume"]]
        return df.astype(float)

    def spec(self) -> SymbolSpec:
        s = self.mt5.symbol_info(self.symbol)
        return SymbolSpec(s.trade_contract_size, s.volume_min, s.volume_step, s.volume_max,
                          s.trade_tick_size, s.trade_stops_level * s.point)

    def spread(self) -> float:
        t = self.mt5.symbol_info_tick(self.symbol)
        return float(t.ask - t.bid)

    def equity(self) -> float:
        return float(self.mt5.account_info().equity)

    def balance(self) -> float:
        return float(self.mt5.account_info().balance)

    # ---- orders ----
    def _send(self, req: dict, retries: int = 3):
        mt5 = self.mt5
        for k in range(retries):
            res = mt5.order_send(req)
            if res is not None and res.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED):
                return res
            log.warning("order_send attempt %d failed: %s %s", k + 1, getattr(res, "retcode", None),
                        getattr(res, "comment", mt5.last_error()))
            time.sleep(0.5 * (k + 1))
        return None

    def _round(self, px: float) -> float:
        ts = self.spec().tick_size
        return round(round(px / ts) * ts, 5)

    def place_limit_group(self, group, direction, entry, sl, legs, expiry):
        mt5 = self.mt5
        otype = mt5.ORDER_TYPE_BUY_LIMIT if direction == 1 else mt5.ORDER_TYPE_SELL_LIMIT
        tickets = []
        for k, (vol, tp) in enumerate(legs):
            req = {"action": mt5.TRADE_ACTION_PENDING, "symbol": self.symbol, "volume": float(vol), "type": otype,
                   "price": self._round(entry), "sl": self._round(sl), "tp": self._round(tp),
                   "magic": self.magic, "comment": f"{group}:{k}"[:31],
                   "type_time": mt5.ORDER_TIME_SPECIFIED,
                   "expiration": int((expiry + self.offset).timestamp()),
                   "type_filling": mt5.ORDER_FILLING_RETURN}
            res = self._send(req)
            if res is None:   # all-or-nothing: never leave a half-built group
                for t in tickets:
                    self.cancel(t)
                return []
            tickets.append(int(res.order))
        return tickets

    def _group(self, comment: str) -> str:
        return comment.rsplit(":", 1)[0] if ":" in comment else comment

    def orders(self):
        out = []
        for o in self.mt5.orders_get(symbol=self.symbol) or []:
            if o.magic == self.magic:
                d = 1 if o.type in (self.mt5.ORDER_TYPE_BUY_LIMIT, self.mt5.ORDER_TYPE_BUY_STOP) else -1
                out.append(BrokerOrder(o.ticket, self._group(o.comment), d, o.volume_current, o.price_open, o.sl, o.tp))
        return out

    def positions(self):
        out = []
        for p in self.mt5.positions_get(symbol=self.symbol) or []:
            if p.magic == self.magic:
                d = 1 if p.type == self.mt5.POSITION_TYPE_BUY else -1
                out.append(BrokerPosition(p.identifier, self._group(p.comment), d, p.volume, p.price_open, p.sl, p.tp))
        return out

    def _pos_by_ident(self, ident: int):
        for p in self.mt5.positions_get(symbol=self.symbol) or []:
            if p.identifier == ident:
                return p
        return None

    def modify_sl(self, ticket, sl):
        p = self._pos_by_ident(ticket)
        if p is None:
            return False
        req = {"action": self.mt5.TRADE_ACTION_SLTP, "symbol": self.symbol, "position": p.ticket,
               "sl": self._round(sl), "tp": p.tp, "magic": self.magic}
        return self._send(req) is not None

    def cancel(self, ticket):
        return self._send({"action": self.mt5.TRADE_ACTION_REMOVE, "order": int(ticket)}) is not None

    def close(self, ticket):
        mt5 = self.mt5
        p = self._pos_by_ident(ticket)
        if p is None:
            return False
        tick = mt5.symbol_info_tick(self.symbol)
        buy = p.type == mt5.POSITION_TYPE_BUY
        req = {"action": mt5.TRADE_ACTION_DEAL, "symbol": self.symbol, "volume": p.volume, "position": p.ticket,
               "type": mt5.ORDER_TYPE_SELL if buy else mt5.ORDER_TYPE_BUY, "price": tick.bid if buy else tick.ask,
               "deviation": 50, "magic": self.magic, "comment": "bot_close",
               "type_filling": mt5.ORDER_FILLING_IOC}
        return self._send(req) is not None

    def realized_pnl(self, tickets):
        total = 0.0
        for t in tickets:
            for d in self.mt5.history_deals_get(position=int(t)) or []:
                total += d.profit + d.commission + d.swap + getattr(d, "fee", 0.0)
        return float(total)
