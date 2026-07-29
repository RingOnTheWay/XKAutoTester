"""
XKAutoTester - 基于Electron+Python的自动化测试平台
"""

import json
from pathlib import Path


def _get_version():
    version_file = Path(__file__).parent.parent.parent / "version.json"
    if version_file.exists():
        with open(version_file, encoding="utf-8") as f:
            version_data = json.load(f)
            return version_data.get("version", "0.0.0")
    return "0.0.0"


__version__ = _get_version()
