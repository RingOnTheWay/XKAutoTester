"""Cli — 应用入口深模块。

藏副作用 (stdout/stderr utf-8 wrap) + 服务 wiring + argparse + 命令注册 + dispatch。

生产: Cli().run()  # 一行
测试: Cli(pytest_runner_factory=lambda: fake, stdout_wrapper=lambda s: s, ...).run(argv=["--inspector"])

与 test_initializer.py 7 keyword-only factory-or-default 模式对称 (RFC 2026-07-27)。
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import sys
from collections.abc import Callable
from typing import TextIO

from main.core.inspector_constants import (
    FIND_LOCATORS,
    GET_SCREENSHOT,
    GET_SOURCE,
    REFRESH,
    START_SESSION,
    STOP_SESSION,
)
from main.core.inspector_service import InspectorService
from main.core.pytest_runner import PytestRunner
from main.core.stdio_protocol import StdioProtocol
from main.utils.i18n import t
from main.utils.logger import get_logger

# ── 工厂类型别名 (与 test_initializer.py L74-81 对称) ──
PytestRunnerFactory = Callable[[], PytestRunner]
StdioProtocolFactory = Callable[[], StdioProtocol]
InspectorServiceFactory = Callable[[StdioProtocol], InspectorService]
Translator = Callable[..., str]  # i18n.t 鸭子类型 (key, **kwargs) -> str
LoggerFactory = Callable[[str], logging.Logger]
IoWrapper = Callable[[TextIO], TextIO]  # utf-8 wrap (TextIO -> TextIO)


class Cli:
    """应用入口深模块。藏副作用 + 服务 wiring + 命令注册 + CLI dispatch。

    生产: Cli().run()  # 一行
    测试: Cli(pytest_runner_factory=lambda: fake, stdout_wrapper=lambda s: s, ...).run(argv=["--inspector"])
    """

    def __init__(
        self,
        *,
        pytest_runner_factory: PytestRunnerFactory | None = None,
        stdio_protocol_factory: StdioProtocolFactory | None = None,
        inspector_service_factory: InspectorServiceFactory | None = None,
        translator: Translator | None = None,
        logger_factory: LoggerFactory | None = None,
        stdout_wrapper: IoWrapper | None = None,
        stderr_wrapper: IoWrapper | None = None,
    ) -> None:
        """工厂-or-default, 全 keyword-only, None 默认 + lambda 兜底。

        匹配 test_initializer.py L146-198 模式 (7 工厂 kwargs)。
        """
        self._pytest_runner_factory: PytestRunnerFactory = pytest_runner_factory or (lambda: PytestRunner())
        self._stdio_protocol_factory: StdioProtocolFactory = stdio_protocol_factory or (lambda: StdioProtocol())
        self._inspector_service_factory: InspectorServiceFactory = inspector_service_factory or (
            lambda proto: InspectorService(proto)
        )
        self._t: Translator = translator or t
        self._logger_factory: LoggerFactory = logger_factory or get_logger
        self._stdout_wrapper: IoWrapper = stdout_wrapper or (
            lambda s: io.TextIOWrapper(s.buffer, encoding="utf-8", line_buffering=True)
        )
        self._stderr_wrapper: IoWrapper = stderr_wrapper or (
            lambda s: io.TextIOWrapper(s.buffer, encoding="utf-8", line_buffering=True)
        )

    def run(self, argv: list[str] | None = None) -> int:
        """入口。argv=None → sys.argv[1:]。

        副作用顺序 (藏内部):
        1. wrap stdout/stderr (utf-8, line_buffering)
        2. argparse (args 契约不变)
        3. dispatch:
           - --inspector → _run_inspector() (阻塞至 stop-session)
           - --test-paths → _run_tests() → 返回 exit code
        4. return exit_code (0/1); inspector 模式返 0

        调用方 sys.exit(Cli().run()) 保 CLI 契约。
        """
        self._wrap_stdio()
        argv = argv if argv is not None else sys.argv[1:]
        args = self._parse_args(argv)
        if args.inspector:
            return self._run_inspector()
        return self._run_tests(
            test_paths=args.test_paths.split(","),
            markers=args.markers.split(",") if args.markers else None,
            test_plan_name=args.test_plan,
        )

    def _wrap_stdio(self) -> None:
        """私有: stdout/stderr utf-8 wrap (藏副作用)。"""
        sys.stdout = self._stdout_wrapper(sys.stdout)
        sys.stderr = self._stderr_wrapper(sys.stderr)

    def _parse_args(self, argv: list[str]) -> argparse.Namespace:
        """私有: argparse + 互斥组 (契约不变)。"""
        parser = argparse.ArgumentParser(description=self._t("python.main.argDescription"))
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--test-paths", help=self._t("python.main.testPathsHelp"))
        group.add_argument("--inspector", action="store_true", help=self._t("python.main.inspectorHelp"))
        parser.add_argument("--markers", help=self._t("python.main.markersHelp"))
        parser.add_argument("--test-plan", help=self._t("python.main.testPlanHelp"))
        return parser.parse_args(argv)

    def _run_tests(self, *, test_paths: list[str], markers: list[str] | None, test_plan_name: str | None) -> int:
        """私有: 测试模式编排 (原 ElectronTestRunner.run_tests)。

        基础信息由渲染进程 model.appendOutput 显示 (>>> 计划详情等), 这里不重复输出。
        summary 用 print → stdout (黑字), pytest 输出由 PytestProcess logger → stderr (红字, 实时)。
        """
        logger = self._logger_factory(__name__)
        pytest_runner = self._pytest_runner_factory()
        try:
            result = pytest_runner.run_custom_tests(
                test_paths=test_paths, markers=markers, generate_allure=True, test_plan_name=test_plan_name
            )
            self._write_electron_markers(result)
            summary = pytest_runner.get_test_summary(result)
            print(summary, flush=True)
            return 0 if result.get("exit_code", 0) == 0 else 1
        except Exception as e:
            # 只 logger.error 到 stderr (红字), 不 print 到 stdout:
            # 避免 ">>> 测试运行失败: {error}" 黑字红字重复 (TEST_OUTPUT + TEST_ERROR)
            # error 全文含子进程 stderr, 已由 PytestProcess 实时转发, 无需再 print
            error_msg = self._t("python.main.testRunFailed", error=str(e))
            logger.error(error_msg)
            return 1

    def _write_electron_markers(self, result: dict) -> None:
        """私有: 写 stdout 标记行供 Electron 父进程解析 (allure 路径 + 测试计划运行)。

        副作用收敛至此, PytestRunner 保持纯函数 (输入参数 → 输出 dict, 无 stdout 副作用)。
        单源化: Electron 是 test_plans.json 唯一写者, 避免双端并发写丢失更新。
        """
        allure_dir = result.get("allure_results_dir")
        if allure_dir:
            print(f"XKAT_ALLURE_RESULTS_DIR:{allure_dir}", flush=True)
        test_plan_name = result.get("test_plan_name")
        if test_plan_name:
            print(
                "XKAT_TEST_PLAN_RUN:"
                + json.dumps(
                    {
                        "name": test_plan_name,
                        "test_paths": result.get("test_paths"),
                        "markers": result.get("markers"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

    def _run_inspector(self) -> int:
        """私有: Inspector 模式编排 (原 InspectorRunner) + 6 命令注册 (用常量)。"""
        logger = self._logger_factory(__name__)
        proto = self._stdio_protocol_factory()
        service = self._inspector_service_factory(proto)
        self._register_inspector_commands(proto, service, logger)
        logger.info("Inspector mode started, waiting for commands on stdin...")
        try:
            proto.run()
        finally:
            # 防资源泄漏: proto.run() 中途异常 (stdin pipe 断/service 内部错误) 时
            # 仍调用 stop_session (幂等, 见 inspector_service.py L369-393) 清理 Appium/driver
            service.stop_session()
        logger.info("Inspector mode ended")
        return 0

    def _register_inspector_commands(self, proto: StdioProtocol, service: InspectorService, logger: logging.Logger) -> None:
        """私有: 6 命令注册, 名字全引自 inspector_constants (零字面量)。"""

        @proto.command(START_SESSION)
        def _start(device_name, app_package, app_activity, platform_version, no_reset):
            return service.start_session(device_name, app_package, app_activity, platform_version, no_reset)

        @proto.command(GET_SCREENSHOT)
        def _screenshot():
            return service.get_screenshot()

        @proto.command(GET_SOURCE)
        def _source():
            return service.get_page_source()

        @proto.command(FIND_LOCATORS)
        def _find(element_path):
            return service.find_locators(element_path)

        @proto.command(REFRESH)
        def _refresh():
            return service.refresh()

        @proto.command(STOP_SESSION)
        def _stop():
            logger.info("Inspector session stopped, exiting inspector mode")
            return service.stop_session()
