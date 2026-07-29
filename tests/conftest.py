"""tests/conftest.py - pytest 公共 fixture"""

import sys
from pathlib import Path

# 将 src 目录加入 sys.path，使 main.* 可导入
_src_dir = Path(__file__).parent.parent / "src"
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

# 导入 tests/unit/helpers/fixtures.py 的共享 fixture
# 使所有 unit test 都能直接使用 mock_adb / mock_subprocess 等
from tests.unit.helpers.fixtures import *  # noqa: F401,F403,E402
