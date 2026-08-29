"""appium_server 端口清理解析单元测试 (R24 P2-5)。

验证 _extract_listening_pids:
- 英文 LISTENING 状态解析
- 中文 Windows 本地化状态"正在侦听"解析 (R24 P2-5 回归: 此前硬编码 LISTENING,
  中文系统端口清理静默失效)
- 端口精确匹配 (防 :4723 vs :47230 子串误匹配)
- TIME_WAIT/非数字 PID 忽略
"""

from main.core.appium_server import _extract_listening_pids

NETSTAT_EN = """\
  TCP    0.0.0.0:4723           0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:47230          0.0.0.0:0              LISTENING       5678
  TCP    127.0.0.1:4723         127.0.0.1:50000        TIME_WAIT       0
  TCP    127.0.0.1:4723         127.0.0.1:50001        ESTABLISHED     9999
  TCP    [::]:4723              [::]:0                 LISTENING       3456
"""

NETSTAT_ZH = """\
  TCP    0.0.0.0:4723           0.0.0.0:0              正在侦听         1234
  TCP    0.0.0.0:47230          0.0.0.0:0              正在侦听         5678
  TCP    [::]:4723              [::]:0                 正在侦听         3456
"""


def test_extract_listening_pids_english_state() -> None:
    pids = _extract_listening_pids(NETSTAT_EN, 4723)
    # :47230 不误匹配; TIME_WAIT(pid=0) 与 ESTABLISHED 忽略
    assert pids == ["1234", "3456"]


def test_extract_listening_pids_chinese_state() -> None:
    """R24 P2-5: 中文 Windows 本地化状态必须识别, 否则端口清理静默失效。"""
    pids = _extract_listening_pids(NETSTAT_ZH, 4723)
    assert pids == ["1234", "3456"]


def test_extract_listening_pids_no_match() -> None:
    assert _extract_listening_pids(NETSTAT_EN, 8080) == []
    assert _extract_listening_pids("", 4723) == []
