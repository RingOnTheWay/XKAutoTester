"""scripts/sync_version.py verify_versions 回归测试 - R25 P2-12

背景: match 变量仅在 pyproject.toml 存在且正则命中 ^version 行时才定义,
pyproject.toml 存在但无 version 行时 verify_versions L270 `if pyproject_content and match:`
抛 NameError → CI version:verify 误报崩溃。

修复: match 在读取 pyproject 后提前赋值 None。

测试覆盖:
1. pyproject.toml 存在但无 version 行 → 不抛 NameError, 正常返回
2. pyproject.toml 有 version 行且不一致 → 返回 False
3. pyproject.toml 不存在 → 正常返回 (原有路径不受影响)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from sync_version import read_version_json, update_build_date, update_version, verify_versions, write_version_json


def _make_project(tmp_path, pyproject_content=None, pyproject_version=None):
    """构造最小项目结构: version.json + electron/package.json (+ 可选 pyproject.toml)"""
    (tmp_path / "electron").mkdir(parents=True)
    (tmp_path / "version.json").write_text(
        json.dumps({"version": "0.1.6", "fullVersion": "0.1.6"}), encoding="utf-8"
    )
    (tmp_path / "electron" / "package.json").write_text(
        json.dumps({"version": "0.1.6"}), encoding="utf-8"
    )
    if pyproject_content is not None:
        (tmp_path / "pyproject.toml").write_text(pyproject_content, encoding="utf-8")
    return tmp_path


@pytest.mark.unit
class TestVerifyVersions:
    def test_pyproject_without_version_line_no_nameerror(self, tmp_path):
        """P2-12 核心回归: pyproject.toml 存在但无 version 行 → 不抛 NameError"""
        project = _make_project(
            tmp_path,
            pyproject_content='[project]\nname = "xkauto-tester"\n',
        )

        result = verify_versions(project)

        assert result is True, "无 version 行的 pyproject 不应导致崩溃, 也不应产生不一致"

    def test_pyproject_version_mismatch_returns_false(self, tmp_path):
        """pyproject.toml 有 version 行但版本不一致 → 返回 False"""
        project = _make_project(
            tmp_path,
            pyproject_content='[project]\nname = "xkauto-tester"\nversion = "0.2.0"\n',
        )

        result = verify_versions(project)

        assert result is False, "pyproject 版本不一致应返回 False"

    def test_pyproject_missing_normal_path(self, tmp_path):
        """pyproject.toml 不存在 → 原有路径不受影响, 返回 True"""
        project = _make_project(tmp_path)

        result = verify_versions(project)

        assert result is True

    def test_pyproject_version_matches_returns_true(self, tmp_path):
        """pyproject.toml 版本一致 → 返回 True"""
        project = _make_project(
            tmp_path,
            pyproject_content='[project]\nname = "xkauto-tester"\nversion = "0.1.6"\n',
        )

        result = verify_versions(project)

        assert result is True

class TestBuildDateOnVersionUpdate:
    """R27: 更新版本号时 buildDate 自动设为当日 (设置页"构建日期"绑定 version.json.buildDate)"""

    def test_update_version_then_build_date_is_today(self):
        """版本更新路径 (main 同序 update_version → update_build_date) → buildDate 当日"""
        data = {
            "version": "0.1.5",
            "buildDate": "2026-08-01",
            "prerelease": "dev.2",
            "fullVersion": "0.1.5-dev.2",
        }
        data = update_version(data, "0.2.0", "beta.1")
        data = update_build_date(data)

        assert data["version"] == "0.2.0"
        assert data["fullVersion"] == "0.2.0-beta.1"
        assert data["buildDate"] == datetime.now().strftime("%Y-%m-%d"), "版本更新后 buildDate 应为当日"

    def test_end_to_end_version_json_build_date_is_today(self, tmp_path):
        """写 version.json → 更新版本 → 落盘 → 文件内 buildDate 为当日"""
        project = _make_project(tmp_path)
        persisted = read_version_json(project)

        updated = update_build_date(update_version(persisted, "0.2.0", "beta.1"))
        write_version_json(project, updated)

        reloaded = read_version_json(project)
        assert reloaded["buildDate"] == datetime.now().strftime("%Y-%m-%d")
        assert reloaded["version"] == "0.2.0"

    def test_update_build_date_unconditional_today(self):
        """--build-date 语义: 无条件覆盖为当日"""
        data = {"version": "0.1.6", "buildDate": "1999-01-01", "prerelease": "", "fullVersion": "0.1.6"}
        assert update_build_date(data)["buildDate"] == datetime.now().strftime("%Y-%m-%d")
