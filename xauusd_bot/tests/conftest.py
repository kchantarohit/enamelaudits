import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from xauusd_bot.config import BotConfig  # noqa: E402
from xauusd_bot.data.synthetic import generate  # noqa: E402


@pytest.fixture(scope="session")
def df():
    return generate("2022-01-03", "2023-06-30", seed=11)


@pytest.fixture()
def cfg():
    c = BotConfig().validate()
    c.log_dir = "/tmp/xau_test_logs"
    return c
