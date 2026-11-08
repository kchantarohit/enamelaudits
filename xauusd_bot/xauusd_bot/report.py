"""Write results to disk and print a compact console report."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

from .backtest.metrics import breakdown

_PCT = {"return_pct", "cagr", "max_drawdown", "win_rate", "win_rate_ex_scratch", "non_loss_rate", "tp1_hit_rate",
        "mc_maxdd_median", "mc_maxdd_p95", "mc_return_median", "mc_return_p5", "mc_prob_loss",
        "deflated_sharpe_prob"}

_ORDER = ["start", "end", "trades", "trades_per_month", "wins", "scratches", "losses", "win_rate",
          "win_rate_ex_scratch", "non_loss_rate", "tp1_hit_rate", "avg_win_r", "avg_loss_r", "expectancy_r",
          "expectancy_usd", "profit_factor", "net_r", "net_pnl", "return_pct", "cagr", "sharpe", "sortino",
          "deflated_sharpe_prob", "max_drawdown", "max_dd_duration_days", "calmar", "max_consec_losses",
          "mc_maxdd_median", "mc_maxdd_p95", "mc_return_p5", "mc_prob_loss"]


def fmt(k: str, v) -> str:
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return str(v)
        return f"{v:.1%}" if k in _PCT else f"{v:,.3f}"
    return str(v)


def print_summary(title: str, s: dict) -> str:
    lines = [f"\n=== {title} ==="]
    for k in _ORDER:
        if k in s:
            lines.append(f"  {k:<24} {fmt(k, s[k])}")
    txt = "\n".join(lines)
    print(txt)
    return txt


def save(out_dir: str | Path, name: str, summary: dict, trades: pd.DataFrame | None = None,
         equity: pd.Series | None = None, extra: dict | None = None) -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    payload = {"summary": summary, **(extra or {})}
    (out / f"{name}_summary.json").write_text(json.dumps(payload, indent=2, default=str))
    if trades is not None and not trades.empty:
        trades.to_csv(out / f"{name}_trades.csv", index=False)
        with (out / f"{name}_breakdown.txt").open("w") as fh:
            for key, tab in breakdown(trades).items():
                fh.write(f"\n--- by {key} ---\n{tab.to_string(float_format=lambda x: f'{x:.3f}')}\n")
    if equity is not None and not equity.empty:
        equity.to_csv(out / f"{name}_equity.csv", header=True)
        try:
            import matplotlib  # noqa: PLC0415
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt  # noqa: PLC0415
            fig, ax = plt.subplots(2, 1, figsize=(11, 6), sharex=True, gridspec_kw={"height_ratios": [3, 1]})
            equity.plot(ax=ax[0], lw=1)
            ax[0].set_title(f"{name} equity")
            (equity / equity.cummax() - 1).plot(ax=ax[1], lw=1, color="tab:red")
            ax[1].set_title("drawdown")
            fig.tight_layout()
            fig.savefig(out / f"{name}_equity.png", dpi=110)
            plt.close(fig)
        except ImportError:
            pass
    return out
