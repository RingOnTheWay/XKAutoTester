#!/usr/bin/env python3
"""XKAutoTester Python 入口。Bootstrap + Cli.run()。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))  # bootstrap: 让 `main.*` 可 import

from main.cli import Cli  # noqa: E402

if __name__ == "__main__":
    sys.exit(Cli().run())
