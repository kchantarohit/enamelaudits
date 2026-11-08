"""Logging: human-readable console + rotating file + JSONL trade journal."""
from __future__ import annotations

import json
import logging
import logging.handlers
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_FMT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def setup_logging(log_dir: str | Path = "logs", level: int = logging.INFO, name: str = "bot") -> logging.Logger:
    root = logging.getLogger()
    if getattr(root, "_xau_configured", False):
        return logging.getLogger(name)
    root.setLevel(level)
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(_FMT))
    root.addHandler(console)
    try:
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        fh = logging.handlers.RotatingFileHandler(Path(log_dir) / f"{name}.log", maxBytes=5_000_000, backupCount=5)
        fh.setFormatter(logging.Formatter(_FMT))
        root.addHandler(fh)
    except OSError:
        root.warning("file logging disabled (cannot write %s)", log_dir)
    root._xau_configured = True  # type: ignore[attr-defined]
    return logging.getLogger(name)


class TradeJournal:
    """Append-only JSONL record of every decision (setups, fills, exits, halts)."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event: str, **payload: Any) -> None:
        rec = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **payload}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, default=str) + "\n")
