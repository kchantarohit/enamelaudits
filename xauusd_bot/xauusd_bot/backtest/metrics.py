"""Performance statistics.

Win-rate definitions are explicit because partial exits + breakeven blur them:
  win     : net R  >  +0.10
  scratch : |net R| <= 0.10   (typically breakeven stops)
  loss    : net R  <  -0.10
``win_rate`` = wins / all trades.  ``win_rate_ex_scratch`` = wins / (wins + losses).
``non_loss_rate`` = (wins + scratches) / all. Quote the one you mean.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

SCRATCH_R = 0.10


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_ppf(p: float) -> float:
    # Acklam's rational approximation (|err| < 1.2e-9); avoids a scipy dependency
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02, 1.383577518672690e02,
         -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02, 6.680131188771972e01,
         -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00, -2.549732539343734e00,
         4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - pl:
        return -_norm_ppf(1 - p)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / \
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def daily_returns(equity: pd.Series) -> pd.Series:
    if equity.empty:
        return pd.Series(dtype=float)
    d = equity.resample("1D").last().dropna()
    return d.pct_change().dropna()


def max_drawdown(equity: pd.Series) -> tuple[float, pd.Timedelta]:
    if equity.empty:
        return 0.0, pd.Timedelta(0)
    peak = equity.cummax()
    dd = equity / peak - 1
    # longest time under water
    under = dd < 0
    longest, start = pd.Timedelta(0), None
    for t, u in under.items():
        if u and start is None:
            start = t
        elif not u and start is not None:
            longest, start = max(longest, t - start), None
    if start is not None:
        longest = max(longest, equity.index[-1] - start)
    return float(dd.min()), longest


def sharpe(rets: pd.Series, periods: int = 252) -> float:
    if len(rets) < 2 or rets.std(ddof=1) == 0:
        return 0.0
    return float(rets.mean() / rets.std(ddof=1) * math.sqrt(periods))


def sortino(rets: pd.Series, periods: int = 252) -> float:
    dn = rets[rets < 0]
    if len(rets) < 2 or len(dn) < 2:
        return 0.0
    dd = math.sqrt((dn ** 2).sum() / len(rets))
    return float(rets.mean() / dd * math.sqrt(periods)) if dd else 0.0


def deflated_sharpe(sr_annual: float, n_obs: int, n_trials: int, skew: float = 0.0, kurt: float = 3.0,
                    sr_trials_std: float | None = None, periods: int = 252) -> float:
    """Bailey & Lopez de Prado (2014). Probability the true Sharpe > 0 after accounting
    for selecting the best of ``n_trials`` configurations. Inputs in per-period units."""
    if n_obs < 3:
        return float("nan")
    sr = sr_annual / math.sqrt(periods)
    var_sr = sr_trials_std ** 2 / periods if sr_trials_std is not None else 1.0 / n_obs
    if n_trials > 1:
        g = 0.5772156649
        sr0 = math.sqrt(var_sr) * ((1 - g) * _norm_ppf(1 - 1 / n_trials) + g * _norm_ppf(1 - 1 / (n_trials * math.e)))
    else:
        sr0 = 0.0
    den = math.sqrt(max(1e-12, 1 - skew * sr + (kurt - 1) / 4 * sr ** 2))
    return _norm_cdf((sr - sr0) * math.sqrt(n_obs - 1) / den)


def classify(r: pd.Series) -> pd.Series:
    return pd.Series(np.where(r > SCRATCH_R, "win", np.where(r < -SCRATCH_R, "loss", "scratch")), index=r.index)


def trade_stats(trades: pd.DataFrame) -> dict:
    if trades is None or trades.empty:
        return {"trades": 0, "win_rate": 0.0, "win_rate_ex_scratch": 0.0, "non_loss_rate": 0.0, "profit_factor": 0.0,
                "expectancy_r": 0.0, "expectancy_usd": 0.0, "net_r": 0.0, "avg_win_r": 0.0, "avg_loss_r": 0.0,
                "max_consec_losses": 0, "tp1_hit_rate": 0.0, "net_pnl": 0.0}
    r, pnl = trades["r"], trades["pnl"]
    cls = classify(r)
    wins, losses, scr = (cls == "win").sum(), (cls == "loss").sum(), (cls == "scratch").sum()
    gp, gl = pnl[pnl > 0].sum(), -pnl[pnl < 0].sum()
    streak = mx = 0
    for v in cls:
        streak = streak + 1 if v == "loss" else 0
        mx = max(mx, streak)
    n = len(trades)
    return {
        "trades": int(n),
        "wins": int(wins), "scratches": int(scr), "losses": int(losses),
        "win_rate": wins / n, "win_rate_ex_scratch": wins / (wins + losses) if wins + losses else 0.0,
        "non_loss_rate": (wins + scr) / n,
        "tp1_hit_rate": float((trades["tps_hit"] >= 1).mean()),
        "profit_factor": float(gp / gl) if gl > 0 else float("inf") if gp > 0 else 0.0,
        "expectancy_r": float(r.mean()), "expectancy_usd": float(pnl.mean()),
        "net_r": float(r.sum()), "net_pnl": float(pnl.sum()),
        "avg_win_r": float(r[cls == "win"].mean()) if wins else 0.0,
        "avg_loss_r": float(r[cls == "loss"].mean()) if losses else 0.0,
        "best_r": float(r.max()), "worst_r": float(r.min()),
        "max_consec_losses": int(mx),
    }


def summary(trades: pd.DataFrame, equity: pd.Series, initial: float, n_trials: int = 1) -> dict:
    rets = daily_returns(equity)
    mdd, mdd_len = max_drawdown(equity)
    years = max((equity.index[-1] - equity.index[0]).days / 365.25, 1e-9) if len(equity) > 1 else 0
    final = float(equity.iloc[-1]) if len(equity) else initial
    cagr = (final / initial) ** (1 / years) - 1 if years > 0 and final > 0 else 0.0
    sr = sharpe(rets)
    out = {
        "start": str(equity.index[0]) if len(equity) else None, "end": str(equity.index[-1]) if len(equity) else None,
        "initial_balance": initial, "final_equity": final, "return_pct": final / initial - 1, "cagr": cagr,
        "sharpe": sr, "sortino": sortino(rets), "max_drawdown": mdd, "max_dd_duration_days": mdd_len.days,
        "calmar": cagr / abs(mdd) if mdd < 0 else 0.0,
        "deflated_sharpe_prob": deflated_sharpe(sr, len(rets), n_trials,
                                                float(rets.skew()) if len(rets) > 3 else 0.0,
                                                float(rets.kurt() + 3) if len(rets) > 3 else 3.0),
    }
    out.update(trade_stats(trades))
    if trades is not None and not trades.empty:
        out["trades_per_month"] = len(trades) / max(years * 12, 1e-9)
    return out


def breakdown(trades: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Win-rate / expectancy tables by direction, session, exit, confluence score, year."""
    if trades is None or trades.empty:
        return {}
    t = trades.copy()
    t["outcome"] = classify(t["r"])
    t["year"] = pd.to_datetime(t["signal_time"]).dt.year

    def agg(g: pd.DataFrame) -> pd.Series:
        n = len(g)
        return pd.Series({"trades": n, "win_rate": (g["outcome"] == "win").mean(),
                          "scratch_rate": (g["outcome"] == "scratch").mean(),
                          "loss_rate": (g["outcome"] == "loss").mean(),
                          "expectancy_r": g["r"].mean(), "net_r": g["r"].sum()})

    out = {}
    for key in ("direction", "session", "exit_reason", "score", "year", "tps_hit"):
        out[key] = t.groupby(key)[["r", "outcome"]].apply(agg)
    return out


def monte_carlo(trades: pd.DataFrame, initial: float, risk: float, n: int = 2000, seed: int = 0) -> dict:
    """Bootstrap the R sequence (with replacement) -> distribution of max DD and final return
    under fixed-fractional sizing. Tells you how bad an ordinary unlucky streak can get."""
    if trades is None or len(trades) < 5:
        return {}
    rng = np.random.default_rng(seed)
    r = trades["r"].to_numpy()
    sims = rng.choice(r, size=(n, len(r)), replace=True)
    eq = initial * np.cumprod(1 + sims * risk, axis=1)
    peak = np.maximum.accumulate(np.concatenate([np.full((n, 1), initial), eq], axis=1), axis=1)[:, 1:]
    mdd = (eq / peak - 1).min(axis=1)
    ret = eq[:, -1] / initial - 1
    return {"mc_maxdd_median": float(np.median(mdd)), "mc_maxdd_p95": float(np.percentile(mdd, 5)),
            "mc_return_median": float(np.median(ret)), "mc_return_p5": float(np.percentile(ret, 5)),
            "mc_prob_loss": float((ret < 0).mean())}
