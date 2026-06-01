#!/usr/bin/env python3
import argparse
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)

src_dir = Path(__file__).parent.parent
sys.path.insert(0, str(src_dir))

from main.core.inspector_service import InspectorService  # noqa: E402
from main.core.pytest_runner import PytestRunner  # noqa: E402
from main.utils.logger import get_logger  # noqa: E402

logger = get_logger(__name__)


class ElectronTestRunner:
    def __init__(self):
        self.pytest_runner = PytestRunner()

    def run_tests(self, test_paths, markers=None, test_plan_name=None):
        try:
            logger.info(f">>> 开始运行测试计划: {test_plan_name or '默认'}")
            logger.info(f">>> 测试路径: {test_paths}")
            if markers:
                logger.info(f">>> 测试标记: {markers}")

            result = self.pytest_runner.run_custom_tests(
                test_paths=test_paths,
                markers=markers,
                generate_allure=True,
                test_plan_name=test_plan_name
            )

            summary = self.pytest_runner.get_test_summary(result)
            logger.info(summary)

            success = result.get("exit_code", 0) == 0

            return {
                "success": success,
                "summary": summary,
                "test_plan_name": test_plan_name,
                "exit_code": result.get("exit_code", 0),
                "test_stats": result.get("test_stats", {"passed": 0, "failed": 0, "skipped": 0, "broken": 0, "total": 0})
            }

        except Exception as e:
            error_msg = f">>> 测试运行失败: {str(e)}"
            logger.error(error_msg)

            return {
                "success": False,
                "error": str(e),
                "test_plan_name": test_plan_name
            }


class InspectorRunner:
    def __init__(self):
        self.service = InspectorService()

    def run(self):
        logger.info("Inspector mode started, waiting for commands on stdin...")
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    command_data = json.loads(line)
                except json.JSONDecodeError as e:
                    self._write_response({"success": False, "error": f"Invalid JSON: {e}"})
                    continue

                command = command_data.get("command", "")
                params = command_data.get("params", {})
                request_id = command_data.get("id")

                response = self._dispatch(command, params)
                if request_id is not None:
                    response["id"] = request_id
                self._write_response(response)

                if command == "stop-session":
                    logger.info("Inspector session stopped, exiting inspector mode")
                    break

            except Exception as e:
                logger.error(f"Inspector loop error: {e}")
                self._write_response({"success": False, "error": str(e)})

        logger.info("Inspector mode ended")

    def _dispatch(self, command: str, params: dict) -> dict:
        try:
            if command == "start-session":
                return self.service.start_session(
                    device_name=params.get("device_name", ""),
                    app_package=params.get("app_package", ""),
                    app_activity=params.get("app_activity", ""),
                    platform_version=params.get("platform_version", ""),
                    no_reset=params.get("no_reset", True),
                )
            elif command == "get-screenshot":
                return self.service.get_screenshot()
            elif command == "get-source":
                return self.service.get_page_source()
            elif command == "find-locators":
                return self.service.find_locators(element_path=params.get("element_path", ""))
            elif command == "refresh":
                return self.service.refresh()
            elif command == "stop-session":
                return self.service.stop_session()
            else:
                return {"success": False, "error": f"Unknown command: {command}"}
        except Exception as e:
            logger.error(f"Command dispatch error for '{command}': {e}")
            return {"success": False, "error": str(e)}

    def _write_response(self, response: dict):
        try:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception as e:
            logger.error(f"Failed to write response: {e}")


def main():
    parser = argparse.ArgumentParser(description='XKAutoTester Electron集成测试运行器')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--test-paths', help='测试路径，多个路径用逗号分隔')
    group.add_argument('--inspector', action='store_true', help='启动Inspector模式，通过stdin/stdout进行JSON通信')
    parser.add_argument('--markers', help='测试标记，多个标记用逗号分隔')
    parser.add_argument('--test-plan', help='测试计划名称')

    args = parser.parse_args()

    if args.inspector:
        runner = InspectorRunner()
        runner.run()
    else:
        test_paths = args.test_paths.split(',')
        markers = args.markers.split(',') if args.markers else None
        test_plan_name = args.test_plan

        runner = ElectronTestRunner()
        result = runner.run_tests(test_paths, markers, test_plan_name)

        sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
