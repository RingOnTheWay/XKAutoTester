"""AdbResult + AdbCommandPort 单元测试。

验证:
- AdbResult.success 属性 (returncode 0 → True, 其他 → False)
- AdbResult 不可变 (frozen dataclass)
- AdbResult 字段访问
"""

from __future__ import annotations

import dataclasses

import pytest

from main.core.adb.adb_port import AdbResult


class TestAdbResult:
    """AdbResult 值对象测试。"""

    def test_success_true_when_returncode_zero(self):
        """returncode=0 → success=True。"""
        result = AdbResult(returncode=0, stdout="ok", stderr="")
        assert result.success is True

    def test_success_false_when_returncode_nonzero(self):
        """returncode≠0 → success=False。"""
        result = AdbResult(returncode=1, stdout="", stderr="err")
        assert result.success is False

    def test_success_false_when_returncode_negative(self):
        """returncode=-1 (异常/超时) → success=False。"""
        result = AdbResult(returncode=-1, stdout="", stderr="timeout")
        assert result.success is False

    def test_frozen_immutable(self):
        """frozen dataclass 不可变。"""
        result = AdbResult(returncode=0, stdout="x", stderr="")
        with pytest.raises(dataclasses.FrozenInstanceError):
            result.returncode = 1

    def test_field_access(self):
        """字段正常访问。"""
        result = AdbResult(returncode=0, stdout="out", stderr="err")
        assert result.returncode == 0
        assert result.stdout == "out"
        assert result.stderr == "err"

    def test_equality(self):
        """同值 AdbResult 相等。"""
        a = AdbResult(0, "x", "")
        b = AdbResult(0, "x", "")
        assert a == b


class TestAdbCommandPortProtocol:
    """AdbCommandPort Protocol 鸭子类型测试。"""

    def test_duck_type_satisfies_protocol(self):
        """任意类有 execute 方法即满足 Protocol (静态检查,运行时仅验证方法存在)。"""

        class FakeAdapter:
            def execute(
                self,
                args: list[str],
                *,
                timeout: float = 10.0,
                capture_output: bool = True,
                text: bool = True,
            ) -> AdbResult:
                return AdbResult(0, "fake", "")

        adapter = FakeAdapter()
        # 鸭子类型: 有 execute 方法即可调用
        result = adapter.execute(["version"])
        assert result.success is True
        assert result.stdout == "fake"
