"""Command line interface.

  python -m xauusd_bot synth       --out data/synthetic_m15.csv
  python -m xauusd_bot backtest    --data data/XAUUSD_M15.csv [--start 2022-01-01] [--end 2024-01-01]
  python -m xauusd_bot walkforward --data data/XAUUSD_M15.csv
  python -m xauusd_bot validate    --data data/XAUUSD_M15.csv --holdout-months 6
  python -m xauusd_bot paper       --data data/XAUUSD_M15.csv --bars 3000
  python -m xauusd_bot live        --config config/live.yaml
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

import pandas as pd

from . import report
from .backtest import metrics as M
from .backtest.engine import Backtester
from .backtest.validation import holdout, purged_cv, walk_forward
from .config import load_config
from .data.loaders import load_csv, resample, to_timedelta
from .logger import setup_logging

log = logging.getLogger("cli")


def _load(args, cfg) -> pd.DataFrame:
    df = load_csv(args.data)
    step = df.index.to_series().diff().median()
    if step < to_timedelta(cfg.timeframes.ltf):
        log.info("resampling %s bars to %s", step, cfg.timeframes.ltf)
        df = resample(df, cfg.timeframes.ltf)
    elif step > to_timedelta(cfg.timeframes.ltf):
        raise SystemExit(f"data step {step} is coarser than ltf {cfg.timeframes.ltf}")
    log.info("loaded %d bars %s -> %s", len(df), df.index[0], df.index[-1])
    return df


def cmd_synth(args, cfg):
    from .data.synthetic import generate  # noqa: PLC0415
    df = generate(args.start or "2021-01-04", args.end or "2025-12-31", seed=args.seed)
    df.to_csv(args.out)
    print(f"wrote {len(df)} bars to {args.out}  (synthetic: for plumbing tests only, contains no edge)")


def cmd_backtest(args, cfg):
    df = _load(args, cfg)
    start = pd.Timestamp(args.start, tz="UTC") if args.start else None
    end = pd.Timestamp(args.end, tz="UTC") if args.end else None
    res = Backtester(cfg).run(df, trade_start=start, trade_end=end)
    s = M.summary(res.trades, res.equity, cfg.backtest.initial_balance)
    s.update(M.monte_carlo(res.trades, cfg.backtest.initial_balance, cfg.risk.risk_per_trade))
    report.print_summary("BACKTEST (in-sample: optimistic by construction)", s)
    if res.events:
        print(f"  breaker events: {len(res.events)} (first: {res.events[0]})")
    out = report.save(args.out, "backtest", s, res.trades, res.equity, {"events": res.events})
    print(f"\nresults -> {out}")


def cmd_walkforward(args, cfg):
    df = _load(args, cfg)
    wf = walk_forward(df, cfg)
    s = wf["oos_summary"]
    s.update(M.monte_carlo(wf["oos_trades"], cfg.backtest.initial_balance, cfg.risk.risk_per_trade))
    print(wf["windows"].to_string(index=False))
    report.print_summary("WALK-FORWARD OUT-OF-SAMPLE (stitched)", s)
    print(f"  wf_efficiency            {wf['wf_efficiency']:.2f}   (OOS score / IS score; > 0.5 is healthy)")
    print(f"  param_stability          {json.dumps(wf['param_stability'], default=str)}")
    report.save(args.out, "walkforward", s, wf["oos_trades"], wf["oos_equity"],
                {"windows": wf["windows"].to_dict("records"), "wf_efficiency": wf["wf_efficiency"],
                 "param_stability": wf["param_stability"], "final_params": wf["final_params"]})


def cmd_validate(args, cfg):
    """Full robustness protocol. The last ``holdout_months`` are never seen by WFO or CV."""
    df = _load(args, cfg)
    ho_start = df.index[-1] - pd.DateOffset(months=args.holdout_months)
    dev = df[df.index < ho_start]
    print(f"development: {dev.index[0].date()} -> {ho_start.date()} | holdout: {ho_start.date()} -> "
          f"{df.index[-1].date()}")

    wf = walk_forward(dev, cfg)
    s_wf = wf["oos_summary"]
    s_wf.update(M.monte_carlo(wf["oos_trades"], cfg.backtest.initial_balance, cfg.risk.risk_per_trade))
    print(wf["windows"].to_string(index=False))
    report.print_summary("1) WALK-FORWARD OOS", s_wf)
    print(f"  wf_efficiency            {wf['wf_efficiency']:.2f}")

    cv = purged_cv(dev, cfg)
    print("\n=== 2) PURGED BLOCKED CV ===")
    print(cv["cv_folds"].to_string(index=False))
    print(f"  CV test mean {cv['cv_test_mean']:.3f} ± {cv['cv_test_std']:.3f}  vs train mean "
          f"{cv['cv_train_mean']:.3f}")
    print(f"  PBO (prob. of backtest overfitting) {cv['pbo']:.2f}   (< 0.2 good, > 0.5 = overfit)")

    params = wf["final_params"]
    ho = holdout(df, cfg, params, ho_start)
    s_ho = ho["summary"]
    report.print_summary(f"3) FINAL HOLDOUT with {params}", s_ho)

    verdict = []
    if s_wf.get("expectancy_r", 0) <= 0:
        verdict.append("walk-forward OOS expectancy <= 0")
    if not cv["pbo"] < 0.5:
        verdict.append(f"PBO {cv['pbo']:.2f} >= 0.5")
    if s_ho.get("trades", 0) and s_ho.get("expectancy_r", 0) <= 0:
        verdict.append("holdout expectancy <= 0")
    if s_wf.get("trades", 0) < 30:
        verdict.append(f"only {s_wf.get('trades', 0)} OOS trades: statistically inconclusive")
    print("\nVERDICT:", "PASS (still paper-trade first)" if not verdict else "FAIL -> " + "; ".join(verdict))

    report.save(args.out, "validate_wf", s_wf, wf["oos_trades"], wf["oos_equity"],
                {"windows": wf["windows"].to_dict("records"), "wf_efficiency": wf["wf_efficiency"]})
    report.save(args.out, "validate_holdout", s_ho, ho["trades"], ho["equity"],
                {"params": params, "pbo": cv["pbo"], "cv": cv["cv_folds"].to_dict("records"), "verdict": verdict})
    cv["score_matrix"].to_csv(f"{args.out}/validate_cv_score_matrix.csv")


def cmd_paper(args, cfg):
    """Dry-run the LIVE code path on historical bars through the paper broker."""
    from .execution.paper import PaperBroker  # noqa: PLC0415
    from .live import LiveTrader  # noqa: PLC0415
    df = _load(args, cfg)
    cfg.live.state_dir = f"{args.out}/paper_state"
    cfg.live.history_bars = args.history
    broker = PaperBroker(df, cfg.instrument, cfg.backtest.initial_balance, start_bar=max(args.history, len(df) - args.bars))
    trader = LiveTrader(cfg, broker)
    trader.start()
    while broker.advance():
        trader.poll()
    print(f"paper run finished: balance {broker.balance():.2f}, journal -> {cfg.log_dir}/journal.jsonl")


def cmd_live(args, cfg):
    from .live import LiveTrader  # noqa: PLC0415
    if cfg.live.broker != "mt5":
        raise SystemExit("live.broker must be 'mt5' for live trading (use the 'paper' command for dry runs)")
    from .execution.mt5 import MT5Broker  # noqa: PLC0415
    LiveTrader(cfg, MT5Broker(cfg)).run_forever()


def main(argv=None):
    p = argparse.ArgumentParser(prog="xauusd_bot")
    p.add_argument("command", choices=["synth", "backtest", "walkforward", "validate", "paper", "live"])
    p.add_argument("--config", default=None)
    p.add_argument("--data", default="data/XAUUSD_M15.csv")
    p.add_argument("--out", default="results")
    p.add_argument("--start")
    p.add_argument("--end")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--holdout-months", type=int, default=6)
    p.add_argument("--bars", type=int, default=3000, help="paper: number of bars to replay")
    p.add_argument("--history", type=int, default=12000, help="paper: bars of history per decision")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)
    cfg = load_config(args.config)
    setup_logging(cfg.log_dir, logging.DEBUG if args.verbose else logging.INFO, name=args.command)
    if args.command == "synth":
        args.out = args.out if args.out.endswith(".csv") else "data/synthetic_m15.csv"
    {"synth": cmd_synth, "backtest": cmd_backtest, "walkforward": cmd_walkforward, "validate": cmd_validate,
     "paper": cmd_paper, "live": cmd_live}[args.command](args, cfg)


if __name__ == "__main__":
    sys.exit(main())
