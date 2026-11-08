"""Robustness toolkit: walk-forward optimisation, purged blocked CV, PBO (CSCV), holdout.

Key idea: features and setups are causal, so they are computed ONCE on the full
history per parameter set and each segment is then backtested with trades
restricted to [segment_start, segment_end). Positions are force-closed at the
segment end, so no trade (and no P&L) crosses from one segment into another.
"""
from __future__ import annotations

import itertools
import logging
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..config import BotConfig
from ..strategy import compute_features, generate_setups
from .engine import Backtester, BacktestResult
from .metrics import summary, trade_stats

log = logging.getLogger("validation")

# config keys that change the feature frame (everything else only changes setups/engine)
_FEATURE_KEYS = ("atr_len", "rsi_len", "ema_fast", "ema_slow", "htf_ema_fast", "htf_ema_slow", "vp_window",
                 "vp_bins", "vp_value_area", "atr_pct_window", "room_lookback", "friday_cutoff_hour")


def objective(trades: pd.DataFrame, name: str, min_trades: int = 0, prior_trades: int = 5) -> float:
    """Score a trade list. No trades -> 0. Fewer than ``min_trades`` -> large penalty
    (used in-sample so the optimiser cannot pick a config that barely trades)."""
    n = 0 if trades is None else len(trades)
    if n == 0 and min_trades == 0:
        return 0.0
    if n < max(min_trades, 1):
        return -1e9
    r = trades["r"]
    if name == "expectancy_r":   # shrunk toward 0: small samples can't win by luck alone
        return float(r.sum() / (len(r) + prior_trades))
    if name == "net_r":
        return float(r.sum())
    if name == "profit_factor":
        gp, gl = r[r > 0].sum(), -r[r < 0].sum()
        return float(min(gp / gl, 10.0)) if gl > 0 else 10.0 if gp > 0 else 0.0
    if name == "sharpe":
        return float(r.mean() / r.std(ddof=1) * math.sqrt(len(r))) if len(r) > 2 and r.std(ddof=1) > 0 else 0.0
    raise ValueError(f"unknown objective {name}")


@dataclass
class Combo:
    params: dict
    cfg: BotConfig
    features: pd.DataFrame = field(repr=False, default=None)
    setups: list = field(repr=False, default=None)


class Evaluator:
    """Caches features/setups per parameter combination."""

    def __init__(self, df: pd.DataFrame, base: BotConfig, grid: dict[str, list]):
        self.df, self.base, self.grid = df, base, grid
        self.keys = list(grid)
        self._feat_cache: dict = {}
        self.combos: list[Combo] = []
        for values in itertools.product(*(grid[k] for k in self.keys)):
            params = dict(zip(self.keys, values))
            self.combos.append(Combo(params, base.with_overrides(params)))

    def prepare(self, combo: Combo) -> Combo:
        if combo.setups is None:
            key = tuple(getattr(combo.cfg.strategy, k) for k in _FEATURE_KEYS) + (
                tuple(map(tuple, combo.cfg.strategy.sessions)), combo.cfg.timeframes.htf)
            if key not in self._feat_cache:
                self._feat_cache[key] = compute_features(self.df, combo.cfg)
            combo.features = self._feat_cache[key]
            combo.setups = generate_setups(self.df, combo.cfg, features=combo.features)
        return combo

    def run(self, combo: Combo, start: pd.Timestamp, end: pd.Timestamp) -> BacktestResult:
        c = self.prepare(combo)
        return Backtester(c.cfg).run(self.df, features=c.features, setups=c.setups, trade_start=start, trade_end=end)

    def neighbours(self, k: int) -> list[int]:
        """Indices of combos within one grid step of combo k in every dimension (incl. itself)."""
        pos = [self.grid[key].index(self.combos[k].params[key]) for key in self.keys]
        out = []
        for j, cb in enumerate(self.combos):
            pj = [self.grid[key].index(cb.params[key]) for key in self.keys]
            if all(abs(a - b) <= 1 for a, b in zip(pos, pj)):
                out.append(j)
        return out


def _chain_equity(parts: list[pd.Series], initial: float) -> pd.Series:
    out, scale = [], 1.0
    for eq in parts:
        if eq.empty:
            continue
        rel = eq / eq.iloc[0]
        out.append(rel * scale * initial)
        scale *= float(rel.iloc[-1])
    return pd.concat(out) if out else pd.Series(dtype=float)


def walk_forward(df: pd.DataFrame, cfg: BotConfig, end: pd.Timestamp | None = None) -> dict:
    wf = cfg.walkforward
    ev = Evaluator(df, cfg, wf.grid)
    first = df.index[0] + pd.DateOffset(days=30)          # indicator warm-up
    last = end if end is not None else df.index[-1]
    windows = []
    s = first
    while s + pd.DateOffset(months=wf.is_months + wf.oos_months) <= last + pd.Timedelta("1D"):
        is_end = s + pd.DateOffset(months=wf.is_months)
        windows.append((s, is_end, min(is_end + pd.DateOffset(months=wf.oos_months), last)))
        s = s + pd.DateOffset(months=wf.step_months)
    if not windows:
        raise ValueError("not enough data for one walk-forward window")

    rows, oos_trades, oos_eq = [], [], []
    for w, (a, b, c) in enumerate(windows):
        is_scores = []
        for cb in ev.combos:
            tr = ev.run(cb, a, b).trades
            is_scores.append(objective(tr, wf.objective, wf.min_trades_is))
        is_scores = np.array(is_scores)
        sel = is_scores.copy()
        if wf.robust_neighbourhood:   # prefer plateaus over spikes
            sel = np.array([np.mean([is_scores[j] for j in ev.neighbours(k)]) for k in range(len(ev.combos))])
        k = int(np.argmax(sel))
        best = ev.combos[k]
        if is_scores.max() <= -1e9:
            log.warning("WF window %d: no combo reached min_trades_is=%d in-sample; selection is arbitrary",
                        w, wf.min_trades_is)
        oos = ev.run(best, b, c)
        oos_trades.append(oos.trades.assign(window=w))
        oos_eq.append(oos.equity)
        st = trade_stats(oos.trades)
        rows.append({"window": w, "is_start": a.date(), "oos_start": b.date(), "oos_end": c.date(), **best.params,
                     "is_score": float(is_scores[k]), "oos_score": objective(oos.trades, wf.objective),
                     "oos_trades": st["trades"], "oos_net_r": st["net_r"], "oos_win_rate": st["win_rate"]})
        log.info("WF window %d %s->%s best=%s IS=%.3f OOS trades=%d netR=%.2f", w, b.date(), c.date(),
                 best.params, is_scores[k], st["trades"], st["net_r"])

    trades = pd.concat(oos_trades, ignore_index=True) if oos_trades else pd.DataFrame()
    equity = _chain_equity(oos_eq, cfg.backtest.initial_balance)
    table = pd.DataFrame(rows)
    is_mean = table["is_score"].replace(-1e9, np.nan).mean()
    oos_mean = table["oos_score"].replace(-1e9, np.nan).mean()
    stability = {key: table[key].value_counts(normalize=True).to_dict() for key in ev.keys}
    return {"windows": table, "oos_trades": trades, "oos_equity": equity,
            "oos_summary": summary(trades, equity, cfg.backtest.initial_balance, n_trials=len(ev.combos)),
            "wf_efficiency": float(oos_mean / is_mean) if is_mean and is_mean > 0 else float("nan"),
            "param_stability": stability, "n_combos": len(ev.combos),
            "final_params": {k: rows[-1][k] for k in ev.keys}}


def purged_cv(df: pd.DataFrame, cfg: BotConfig, end: pd.Timestamp | None = None) -> dict:
    """Blocked K-fold CV with embargo + Probability of Backtest Overfitting (CSCV).

    Each fold trades only inside [fold_start + embargo, fold_end); trades are closed at
    fold end. Produces a (combos x folds) score matrix used for both CV and PBO.
    """
    wf = cfg.walkforward
    ev = Evaluator(df, cfg, wf.grid)
    start = df.index[0] + pd.DateOffset(days=30)
    stop = end if end is not None else df.index[-1]
    edges = pd.date_range(start, stop, periods=wf.cv_folds + 1)
    emb = pd.Timedelta(days=wf.cv_embargo_days)
    S = np.zeros((len(ev.combos), wf.cv_folds))
    for i, cb in enumerate(ev.combos):
        for k in range(wf.cv_folds):
            a = edges[k] + (emb if k > 0 else pd.Timedelta(0))
            S[i, k] = objective(ev.run(cb, a, edges[k + 1]).trades, wf.objective)

    cv_rows = []
    for k in range(wf.cv_folds):
        train = [j for j in range(wf.cv_folds) if j != k]
        best = int(np.argmax(S[:, train].mean(axis=1)))
        cv_rows.append({"fold": k, "start": edges[k].date(), "end": edges[k + 1].date(),
                        "chosen": ev.combos[best].params, "train_score": float(S[best, train].mean()),
                        "test_score": float(S[best, k])})
    cv = pd.DataFrame(cv_rows)
    return {"cv_folds": cv, "cv_test_mean": float(cv["test_score"].mean()),
            "cv_test_std": float(cv["test_score"].std(ddof=1)), "cv_train_mean": float(cv["train_score"].mean()),
            "pbo": pbo_cscv(S), "score_matrix": pd.DataFrame(S, index=[str(c.params) for c in ev.combos])}


def pbo_cscv(S: np.ndarray) -> float:
    """Bailey et al. (2015) Combinatorially Symmetric CV. Returns P(best-IS config is
    below median OOS). ~0 = robust selection, >=0.5 = selection is no better than random."""
    n_cfg, T = S.shape
    if n_cfg < 2 or T < 2 or T % 2:
        return float("nan")
    lambdas = []
    for half in itertools.combinations(range(T), T // 2):
        other = [j for j in range(T) if j not in half]
        is_ = S[:, list(half)].mean(axis=1)
        oos = S[:, other].mean(axis=1)
        best = int(np.argmax(is_))
        rank = (oos < oos[best]).sum() + 0.5 * ((oos == oos[best]).sum() - 1) + 1
        w = rank / (n_cfg + 1)
        lambdas.append(math.log(w / (1 - w)))
    return float(np.mean(np.array(lambdas) <= 0))


def holdout(df: pd.DataFrame, cfg: BotConfig, params: dict, start: pd.Timestamp) -> dict:
    """Single, final, untouched out-of-sample test. Run it once; if you tune after looking,
    it is no longer out-of-sample."""
    c = cfg.with_overrides(params)
    res = Backtester(c).run(df, trade_start=start)
    return {"summary": summary(res.trades, res.equity, c.backtest.initial_balance), "trades": res.trades,
            "equity": res.equity}
